import { Injectable, Logger } from "@nestjs/common";
import type {
  AIProvider,
  AIProviderGenerateRequest,
  AIProviderGenerateResponse,
  AIProviderStreamEvent,
  MaitriToolSpec,
} from "@hms/shared";

// ---------------------------------------------------------------------------
// Remote Gemma runtime (OpenAI-compatible endpoint serving Gemma, e.g.
// Ollama, vLLM, LM Studio, or a hosted Gemma endpoint).
// ---------------------------------------------------------------------------

export interface RemoteAIConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
}

/**
 * Talks to any OpenAI-compatible chat-completions endpoint. Gemma served
 * through Ollama/vLLM/LM Studio exposes this shape, so the HMS only needs
 * base URL + model name — no model-specific SDK.
 */
export class RemoteOpenAICompatProvider implements AIProvider {
  readonly name: string;
  private readonly logger = new Logger("MaitriProvider");

  constructor(private readonly config: RemoteAIConfig) {
    this.name = `gemma:${config.model}`;
  }

  async generate(
    request: AIProviderGenerateRequest,
  ): Promise<AIProviderGenerateResponse> {
    const body = {
      model: this.config.model,
      messages: [
        { role: "system", content: request.systemPrompt },
        ...request.messages,
      ],
      ...(request.tools?.length
        ? {
            tools: request.tools.map((t) => ({
              type: "function",
              function: {
                name: t.name,
                description: t.description,
                parameters: t.inputSchema,
              },
            })),
          }
        : {}),
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 600,
      stream: false,
    };

    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.config.apiKey
          ? { Authorization: `Bearer ${this.config.apiKey}` }
          : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `AI provider error (${res.status}): ${text.slice(0, 200)}`,
      );
    }

    const json: any = await res.json();
    const choice = json?.choices?.[0];
    const message = choice?.message ?? {};
    return {
      content: typeof message.content === "string" ? message.content : "",
      toolCalls: Array.isArray(message.tool_calls)
        ? message.tool_calls.map((tc: any) => ({
            name: tc?.function?.name,
            arguments: safeParseArgs(tc?.function?.arguments),
          }))
        : undefined,
      finishReason: choice?.finish_reason,
    }
  }

  async *stream(
    request: AIProviderGenerateRequest,
  ): AsyncGenerator<AIProviderStreamEvent> {
    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.config.apiKey
          ? { Authorization: `Bearer ${this.config.apiKey}` }
          : {}),
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: "system", content: request.systemPrompt },
          ...request.messages,
        ],
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens ?? 600,
        stream: true,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok || !res.body) {
      throw new Error(`AI provider error (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") {
          yield { type: "done" };
          return;
        }
        try {
          const json = JSON.parse(data);
          const delta = json?.choices?.[0]?.delta;
          if (typeof delta?.content === "string" && delta.content) {
            yield { type: "token", content: delta.content };
          }
        } catch {
          // partial frame — ignore
        }
      }
    }
    yield { type: "done" };
  }
}

function safeParseArgs(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null
        ? parsed
        : { value: parsed };
    } catch {
      return {};
    }
  }
  return {};
}

// ---------------------------------------------------------------------------
// Fallback: deterministic extraction (no model runtime configured)
// ---------------------------------------------------------------------------

/**
 * When no Gemma runtime is configured the assistant must still work for core
 * HMS operations — spec forbids fake success, so the fallback NEVER pretends
 * the model reasoned: it deterministically maps clear command patterns to
 * tools and answers read questions from real HMS data. Anything it cannot map
 * is declined honestly, and open-ended requests get an explicit
 * "model runtime not configured" notice.
 *
 * This keeps the product functional (and demo-able) offline while the same
 * orchestrator, permission guard, tool registry and audit trail run
 * identically for both runtimes.
 */
export class RuleBasedProvider implements AIProvider {
  readonly name = "rule-based-fallback";

  async generate(
    request: AIProviderGenerateRequest,
  ): Promise<AIProviderGenerateResponse> {
    const lastUser = [...request.messages]
      .reverse()
      .find((m) => m.role === "user")?.content ?? "";
    const text = lastUser.toLowerCase();
    const tools = request.tools ?? [];

    const tryMatch = (name: string, args: Record<string, unknown>) => {
      const tool = tools.find((t) => t.name === name);
      return tool ? { name, arguments: args } : null;
    };

    // --- navigation --------------------------------------------------------
    const navTargets: [RegExp, string, string][] = [
      [/\b(dashboard|overview|home)\b/, "dashboard", "Dashboard"],
      [/\bpatients?\b/, "patients", "Patients"],
      [/\bappointments?\b|\bqueue\b/, "appointments", "Appointments"],
      [/\bencounters?\b|\bconsultations?\b/, "encounters", "Encounters"],
      [/\badmissions?\b|\badmits?\b/, "admissions", "Admissions"],
      [/\bbeds?\b|\bwards?\b/, "beds", "Bed management"],
      [/\bdoctors?\b|\bphysicians?\b/, "doctors", "Doctors"],
      [/\bemergency\b|\ber\b/, "emergency", "Emergency"],
      [/\bnursing\b/, "nursing", "Nursing"],
      [/\blabs?\b|\blaboratory\b/, "laboratory", "Laboratory"],
      [/\bradiology\b|\bx-?rays?\b|\bimaging\b/, "radiology", "Radiology"],
      [/\bbilling\b|\binvoices?\b|\bpayments?\b/, "billing", "Billing"],
      [/\bpharmacy\b|\bmedicines?\b|\bdrugs?\b/, "pharmacy_medicines", "Pharmacy medicines"],
      [/\bstaff\b|\bhr\b|\bemployees?\b/, "staff", "HR & Staff"],
      [/\bdepartments?\b/, "departments", "Departments"],
      [/\bprocurement\b|\bpurchase\b/, "procurement", "Procurement"],
      [/\bsettings?\b/, "settings", "Settings"],
      [/\baudit\b/, "audit", "Audit logs"],
      [/\bnotifications?\b/, "notifications", "Notifications"],
    ];

    const wantsNav =
      /\b(open|go to|take me|show me the|navigate|jump to)\b/.test(text) ||
      (/\bshow\b/.test(text) && !/\bhow many|which|what|find|search\b/.test(text));
    if (wantsNav) {
      for (const [re, key, label] of navTargets) {
        if (re.test(text)) {
          const tool = tryMatch("navigate_to_module", {
            target: key,
            label,
          });
          if (tool) return { content: "", toolCalls: [tool], finishReason: "tool_calls" };
        }
      }
    }

    // --- read questions ----------------------------------------------------
    if (
      /\b(bed|beds)\b/.test(text) &&
      /\b(availab|free|occupanc|status|how many)\b/.test(text)
    ) {
      const tool = tryMatch("get_bed_availability", {});
      if (tool) return { content: "", toolCalls: [tool], finishReason: "tool_calls" };
    }
    if (
      /\b(low|shortage|shortag|out of stock)\b/.test(text) &&
      /\b(stock|medicines?|drugs?|inventory)\b/.test(text)
    ) {
      const tool = tryMatch("get_low_stock_medicines", {});
      if (tool) return { content: "", toolCalls: [tool], finishReason: "tool_calls" };
    }
    if (
      /\b(expir|expiring|expiry)\b/.test(text) &&
      /\b(medicines?|drugs?|stock|inventory)\b/.test(text)
    ) {
      const tool = tryMatch("get_expiring_medicines", {});
      if (tool) return { content: "", toolCalls: [tool], finishReason: "tool_calls" };
    }
    if (
      /\b(find|search|show|open)\b/.test(text) &&
      /\bpatient|mrn|registration\b/.test(text) &&
      !wantsNav
    ) {
      const query = extractQuery(lastUser, [
        "patient", "patients", "find", "search", "show", "open", "mrn",
        "registration", "for", "the", "a", "an",
      ]);
      if (query) {
        const tool = tryMatch("search_patient", { query });
        if (tool) return { content: "", toolCalls: [tool], finishReason: "tool_calls" };
      }
    }
    if (/\b(today'?s?)\b.*\bappointments?\b|\bappointments?\b.*\btoday\b/.test(text)) {
      const tool = tryMatch("get_todays_appointments", {});
      if (tool) return { content: "", toolCalls: [tool], finishReason: "tool_calls" };
    }
    if (/\bpending\b.*\blabs?\b|\blabs?\b.*\bpending\b/.test(text)) {
      const tool = tryMatch("get_pending_lab_orders", {});
      if (tool) return { content: "", toolCalls: [tool], finishReason: "tool_calls" };
    }

    // --- explicit creation commands ---------------------------------------
    const emailMatch = lastUser.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
    const nameMatch = lastUser.match(
      /\b(?:named|name|for)\s+([A-Z][a-z]+)(?:\s+([A-Z][a-z]+))?/,
    );
    if (
      /\b(create|add|register)\b/.test(text) &&
      /\b(staff|user|account|employee)\b/.test(text) &&
      emailMatch &&
      nameMatch
    ) {
      const roleMatch =
        lastUser.match(/\brole\s+([A-Z_]{3,30})/) ??
        lastUser.match(/\b(NURSE|DOCTOR|PHARMACIST|RECEPTIONIST|HR_MANAGER|LAB_TECHNICIAN)\b/);
      const tool = tryMatch("create_staff", {
        firstName: nameMatch[1],
        lastName: nameMatch[2] ?? nameMatch[1],
        email: emailMatch[0],
        role: roleMatch ? roleMatch[1].toUpperCase() : "NURSE",
      });
      if (tool) return { content: "", toolCalls: [tool], finishReason: "tool_calls" };
    }
    if (
      /\b(create|add|register)\b/.test(text) &&
      /\bpatient\b/.test(text) &&
      nameMatch
    ) {
      const tool = tryMatch("create_patient", {
        firstName: nameMatch[1],
        lastName: nameMatch[2] ?? nameMatch[1],
      });
      if (tool) return { content: "", toolCalls: [tool], finishReason: "tool_calls" };
    }

    // nothing matched → honest decline; open-ended chat gets the notice
    if (/\b(hello|hi|hey|help|what can you do)\b/.test(text)) {
      return {
        content:
          "I'm Maitri Assistant — I can help with Maitri HMS operations: finding patients, opening modules, checking beds, stock, appointments and more. (Running in offline mode: connect a Gemma runtime for full natural-language understanding.)",
      };
    }
    return {
      content:
        "I can help only with Maitri HMS operations. In offline mode I understand direct commands like \"open patients\", \"find patient Sita\", \"how many beds are available\" or \"show low stock medicines\". Connect a Gemma runtime (MAITRI_AI_BASE_URL) for full natural-language understanding.",
    };
  }
}

function extractQuery(raw: string, stop: string[]): string {
  let t = raw.trim();
  for (const w of stop) {
    t = t.replace(new RegExp(`\\b${w}\\b`, "gi"), " ");
  }
  return t.replace(/[^a-zA-Z0-9 \-.]/g, "").replace(/\s+/g, " ").trim();
}
