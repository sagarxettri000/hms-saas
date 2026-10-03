import {
  isOutOfScope,
  composeResultReply,
  friendlyToolError,
  looksLikeFieldValue,
  extractJsonObject,
} from "./maitri-orchestrator.service";
import { RuleBasedProvider } from "./ai-provider";
import {
  maitriCanUseTool,
  maitriRoleHasAction,
  isMaitriAdminRole,
} from "@hms/shared";

// ---------------------------------------------------------------------------
// Out-of-scope gate (spec 3): HMS-only assistant
// ---------------------------------------------------------------------------

describe("out-of-scope refusal", () => {
  it.each([
    "What's the weather tomorrow?",
    "Tell me a joke",
    "Write my homework essay",
    "Who won the game last night?",
    "Book me a flight to Kathmandu",
    "What is the capital of France?",
  ])("refuses: %s", (msg) => {
    expect(isOutOfScope(msg)).toBe(true);
  });

  it.each([
    "Find patient Sita Rai",
    "How many beds are available?",
    "Show low stock medicines",
    "Open pharmacy",
    "Book Sita tomorrow at 10",
  ])("allows HMS request: %s", (msg) => {
    expect(isOutOfScope(msg)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Permission matrix (spec 37): backend-enforced, never model-decided
// ---------------------------------------------------------------------------

describe("maitri permission matrix", () => {
  it("gives a receptionist patient read but not staff create", () => {
    expect(maitriCanUseTool("RECEPTIONIST", [{ module: "patients", action: "VIEW" }])).toBe(true);
    expect(maitriCanUseTool("RECEPTIONIST", [{ module: "staff", action: "CREATE" }])).toBe(false);
  });

  it("gives a pharmacist pharmacy access but not billing write", () => {
    expect(maitriCanUseTool("PHARMACIST", [{ module: "pharmacy", action: "VIEW" }])).toBe(true);
    expect(maitriCanUseTool("PHARMACIST", [{ module: "billing", action: "CREATE" }])).toBe(false);
  });

  it("gives a doctor lab view but not pharmacy access", () => {
    expect(maitriCanUseTool("DOCTOR", [{ module: "laboratory", action: "VIEW" }])).toBe(true);
    expect(maitriCanUseTool("DOCTOR", [{ module: "pharmacy", action: "VIEW" }])).toBe(false);
  });

  it("denies HR-only modules to clinical roles", () => {
    expect(maitriCanUseTool("NURSE", [{ module: "staff", action: "VIEW" }])).toBe(false);
    expect(maitriCanUseTool("HR_MANAGER", [{ module: "staff", action: "VIEW" }])).toBe(true);
    expect(maitriCanUseTool("HR_MANAGER", [{ module: "staff", action: "CREATE" }])).toBe(true);
  });

  it("denies unknown roles everything", () => {
    expect(maitriCanUseTool("UNKNOWN_ROLE", [{ module: "patients", action: "VIEW" }])).toBe(false);
    expect(maitriRoleHasAction("UNKNOWN_ROLE", "VIEW")).toBe(false);
  });

  it("allows admin bypass roles", () => {
    expect(isMaitriAdminRole("PLATFORM_SUPER_ADMIN")).toBe(true);
    expect(isMaitriAdminRole("HOSPITAL_ADMIN")).toBe(true);
    expect(isMaitriAdminRole("NURSE")).toBe(false);
    expect(maitriCanUseTool("PLATFORM_SUPER_ADMIN", [{ module: "staff", action: "CREATE" }])).toBe(true);
  });

  it("requires ALL listed permission pairs to pass", () => {
    expect(
      maitriCanUseTool("RECEPTIONIST", [
        { module: "patients", action: "VIEW" },
        { module: "patients", action: "CREATE" },
      ]),
    ).toBe(true);
    expect(
      maitriCanUseTool("RECEPTIONIST", [
        { module: "patients", action: "VIEW" },
        { module: "pharmacy", action: "VIEW" },
      ]),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rule-based fallback provider: only allowlisted tools, honest refusals
// ---------------------------------------------------------------------------

describe("rule-based fallback provider", () => {
  const fullTools = [
    { name: "navigate_to_module", description: "", inputSchema: {} },
    { name: "search_patient", description: "", inputSchema: {} },
    { name: "get_bed_availability", description: "", inputSchema: {} },
    { name: "get_low_stock_medicines", description: "", inputSchema: {} },
    { name: "get_todays_appointments", description: "", inputSchema: {} },
  ] as any;

  function providerWith(tools: any[]) {
    const p = new RuleBasedProvider();
    return p.generate({
      systemPrompt: "test",
      messages: [{ role: "user", content: msg() }],
      tools,
    });
  }

  let msg: () => string = () => "";

  it("maps 'open pharmacy' to the navigation tool only", async () => {
    msg = () => "open pharmacy";
    const res = await providerWith(fullTools);
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls![0].name).toBe("navigate_to_module");
    expect(res.toolCalls![0].arguments.target).toBe("pharmacy_medicines");
  });

  it("maps a patient lookup to search_patient with an extracted query", async () => {
    msg = () => "find patient Sita Rai";
    const res = await providerWith(fullTools);
    expect(res.toolCalls![0].name).toBe("search_patient");
    const q = String(res.toolCalls![0].arguments.query);
    expect(q.toLowerCase()).toContain("sita");
  });

  it("maps bed availability questions to the bed tool", async () => {
    msg = () => "how many beds are available?";
    const res = await providerWith(fullTools);
    expect(res.toolCalls![0].name).toBe("get_bed_availability");
  });

  it("never invents a tool outside the provided allowlist", async () => {
    msg = () => "open pharmacy";
    const res = await providerWith([{ name: "search_patient", description: "", inputSchema: {} } as any]);
    // navigation tool not offered → no tool call, no fabricated answer
    expect(res.toolCalls ?? []).toHaveLength(0);
  });

  it("declines open-ended chat honestly instead of hallucinating", async () => {
    msg = () => "explain quantum computing to me";
    const res = await providerWith(fullTools);
    expect(res.content).toContain("Maitri HMS");
  });
});

// ---------------------------------------------------------------------------
// Honest reply composition (spec 45/49): reflect real data, never fake success
// ---------------------------------------------------------------------------

describe("composeResultReply", () => {
  it("reports no matches honestly", () => {
    const reply = composeResultReply("search_patient", []);
    expect(reply).toMatch(/couldn't find/i);
  });

  it("reports found patients from real data", () => {
    const reply = composeResultReply("search_patient", [
      { id: "p1", name: "Sita Rai", mrn: "MRN-1024" },
    ]);
    expect(reply).toContain("Sita Rai");
    expect(reply).toContain("MRN-1024");
  });

  it("reports bed numbers from real data", () => {
    const reply = composeResultReply("get_bed_availability", {
      totalBeds: 40,
      availableBeds: 14,
    });
    expect(reply).toContain("14");
    expect(reply).toContain("40");
  });

  it("never claims success for empty data", () => {
    const reply = composeResultReply("get_todays_appointments", { count: 0 });
    expect(reply).toMatch(/no appointments/i);
  });
});

// ---------------------------------------------------------------------------
// Form continuation detection (spec 15/29): field-value messages continue an
// open form instead of being re-interpreted as new commands
// ---------------------------------------------------------------------------

describe("looksLikeFieldValue", () => {
  it.each([
    "Employee ID 2048",
    "department: Emergency",
    "phone 9801234567",
    "2048",
  ])("treats as form detail: %s", (msg) => {
    expect(looksLikeFieldValue(msg)).toBe(true);
  });

  it.each([
    "find patient Sita",
    "how many beds are available?",
    "open pharmacy",
  ])("does not treat commands as form details: %s", (msg) => {
    expect(looksLikeFieldValue(msg)).toBe(false);
  });
});

describe("extractJsonObject", () => {
  it("extracts the first JSON object from surrounding text", () => {
    expect(extractJsonObject('Sure: {"firstName":"Suman"} done')).toEqual({
      firstName: "Suman",
    });
  });

  it("returns null for non-JSON text", () => {
    expect(extractJsonObject("no json here")).toBeNull();
    expect(extractJsonObject("{broken")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Fallback coverage for the new contract tools
// ---------------------------------------------------------------------------

describe("rule-based fallback: form opening and new reads", () => {
  const fullTools = [
    { name: "navigate_to_module", description: "", inputSchema: {} },
    { name: "search_patient", description: "", inputSchema: {} },
    { name: "search_doctor", description: "", inputSchema: {} },
    { name: "find_available_appointment_slots", description: "", inputSchema: {} },
    { name: "get_pending_bills", description: "", inputSchema: {} },
    { name: "open_create_form", description: "", inputSchema: {} },
    { name: "create_staff", description: "", inputSchema: {} },
  ] as any;

  let msg: () => string = () => "";
  function providerWith(tools: any[]) {
    const p = new RuleBasedProvider();
    return p.generate({
      systemPrompt: "test",
      messages: [{ role: "user", content: msg() }],
      tools,
    });
  }

  it("opens the real staff form prefilled when email is unknown", async () => {
    msg = () => "Add Suman Thapa as a nurse";
    const res = await providerWith(fullTools);
    expect(res.toolCalls![0].name).toBe("open_create_form");
    expect(res.toolCalls![0].arguments.target).toBe("staff");
    const fields = JSON.parse(String(res.toolCalls![0].arguments.fields));
    expect(fields.firstName).toBe("Suman");
    expect(fields.role).toBe("NURSE");
  });

  it("prefers direct creation when the email is provided", async () => {
    msg = () => "Create staff Sita Karki email s.karki@nbmaitri.com role NURSE";
    const res = await providerWith(fullTools);
    expect(res.toolCalls![0].name).toBe("create_staff");
  });

  it("maps pending bill questions to the billing tool", async () => {
    msg = () => "show pending bills";
    const res = await providerWith(fullTools);
    expect(res.toolCalls![0].name).toBe("get_pending_bills");
  });

  it("maps doctor lookups to search_doctor", async () => {
    msg = () => "find doctor Sharma";
    const res = await providerWith(fullTools);
    expect(res.toolCalls![0].name).toBe("search_doctor");
    expect(String(res.toolCalls![0].arguments.query)).toContain("Sharma");
  });

  it("maps slot requests to find_available_appointment_slots with a date", async () => {
    msg = () => "find available slots tomorrow";
    const res = await providerWith(fullTools);
    expect(res.toolCalls![0].name).toBe("find_available_appointment_slots");
    expect(res.toolCalls![0].arguments.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// Error mapping (spec 24): no raw stack traces to users
// ---------------------------------------------------------------------------

describe("friendlyToolError", () => {
  it("translates conflicts into slot suggestions", () => {
    const reply = friendlyToolError("create_appointment", "Slot conflict: overlap with existing appointment");
    expect(reply).toMatch(/no longer available/i);
  });

  it("translates authorization errors without leaking policy", () => {
    const reply = friendlyToolError("x", "ForbiddenException: Insufficient permissions");
    expect(reply).toMatch(/don't have permission/i);
  });

  it("hides raw error details for generic failures", () => {
    const reply = friendlyToolError("x", "ECONNREFUSED 10.0.0.1:5432 at /app/src/db.ts:42");
    expect(reply).not.toContain("ECONNREFUSED");
    expect(reply).not.toContain("/app/src");
  });

  it("never leaks Prisma invocation errors, even with the word 'Invalid'", () => {
    const reply = friendlyToolError(
      "get_low_stock_medicines",
      "Invalid `prisma.inventoryItem.findMany()` invocation:\nCan't reach database server at `db.prisma.io:5432`",
    );
    expect(reply).not.toContain("prisma");
    expect(reply).not.toContain("invocation");
    expect(reply).toMatch(/HMS service returned an error/);
  });
});

// ---------------------------------------------------------------------------
// Panel quick-action phrases: every chip in MaitriPanel must reach its data
// tool in offline mode (these are the exact strings the UI sends).
// ---------------------------------------------------------------------------

describe("rule-based fallback: panel quick-action phrases", () => {
  const tools = [
    { name: "navigate_to_module", description: "", inputSchema: {} },
    { name: "get_todays_appointments", description: "", inputSchema: {} },
    { name: "get_bed_availability", description: "", inputSchema: {} },
    { name: "get_todays_collections", description: "", inputSchema: {} },
    { name: "get_patient_summary", description: "", inputSchema: {} },
    { name: "get_patient_visits", description: "", inputSchema: {} },
    { name: "get_patient_reports", description: "", inputSchema: {} },
    { name: "search_patient", description: "", inputSchema: {} },
    { name: "find_available_appointment_slots", description: "", inputSchema: {} },
  ] as any;

  const ask = (message: string, extra: Record<string, unknown> = {}) =>
    new RuleBasedProvider().generate({
      systemPrompt: "test",
      messages: [{ role: "user", content: message }],
      tools,
      ...extra,
    });

  it("“Show today’s appointments” lists them instead of navigating", async () => {
    const res = await ask("Show today's appointments");
    expect(res.toolCalls![0].name).toBe("get_todays_appointments");
  });

  it("bare “show appointments” still navigates to the module", async () => {
    const res = await ask("show appointments");
    expect(res.toolCalls![0].name).toBe("navigate_to_module");
    expect(res.toolCalls![0].arguments.target).toBe("appointments");
  });

  it("“book appointment today” stays a booking, not the appointments list", async () => {
    const res = await ask("book appointment today");
    expect(res.toolCalls![0].name).toBe("find_available_appointment_slots");
  });

  it("“show available beds” queries bed availability", async () => {
    const res = await ask("show me available beds");
    expect(res.toolCalls![0].name).toBe("get_bed_availability");
  });

  it("“What are today’s collections?” maps to the billing tool", async () => {
    const res = await ask("What are today's collections?");
    expect(res.toolCalls![0].name).toBe("get_todays_collections");
  });

  it("“Summarize this patient” uses the on-screen patient", async () => {
    const res = await ask("Summarize this patient", { contextEntityId: "p1" });
    expect(res.toolCalls![0].name).toBe("get_patient_summary");
    expect(res.toolCalls![0].arguments.patientId).toBe("p1");
  });

  it("“Show recent visits for this patient” reads the record, never a junk search", async () => {
    const res = await ask("Show recent visits for this patient", {
      context: { currentEntity: "patient", currentEntityId: "p2" },
    });
    expect(res.toolCalls![0].name).toBe("get_patient_visits");
    expect(res.toolCalls![0].arguments.patientId).toBe("p2");
  });

  it("“Show recent reports for this patient” reads the record", async () => {
    const res = await ask("Show recent reports for this patient", {
      contextEntityId: "p3",
    });
    expect(res.toolCalls![0].name).toBe("get_patient_reports");
    expect(res.toolCalls![0].arguments.patientId).toBe("p3");
  });

  it("plain patient search is unaffected by the read guards", async () => {
    const res = await ask("find patient Sita Rai");
    expect(res.toolCalls![0].name).toBe("search_patient");
  });
});
