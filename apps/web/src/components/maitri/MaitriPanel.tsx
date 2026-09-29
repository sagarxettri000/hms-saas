'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MaitriStreamEvent } from '@hms/shared';
import { collectMaitriContext, streamMaitriChat } from '@/lib/maitri-client';
import MaitriConversation from './MaitriConversation';
import MaitriInput from './MaitriInput';
import type { ConversationItem } from './types';

/** Map a registry module key to the HMS screen that owns its create form. */
function moduleRoute(key: string): string {
  const map: Record<string, string> = {
    staff: '/hr',
    patients: '/patients',
    appointments: '/appointments',
    departments: '/departments',
  };
  return map[key] ?? `/${key}`;
}

/** Context-aware quick actions per HMS module (spec §6). */
const QUICK_ACTIONS_BY_MODULE: Record<string, { label: string; prompt: string }[]> = {
  patients: [
    { label: 'Find patient', prompt: 'Find patient ' },
    { label: "Today's appointments", prompt: "Show today's appointments" },
  ],
  appointments: [
    { label: "Today's appointments", prompt: "Show today's appointments" },
    { label: 'Check open slots', prompt: 'Find available slots tomorrow' },
  ],
  beds: [{ label: 'Bed availability', prompt: 'How many beds are available?' }],
  pharmacy: [
    { label: 'Low stock', prompt: 'Show medicines with low stock' },
    { label: 'Expiring soon', prompt: 'Which medicines are expiring soon?' },
  ],
  laboratory: [{ label: 'Pending tests', prompt: 'Show pending lab orders' }],
  billing: [
    { label: "Today's collections", prompt: "What are today's collections?" },
    { label: 'Pending invoices', prompt: 'Search pending invoices' },
  ],
  dashboard: [
    { label: 'Bed status', prompt: 'How many beds are available?' },
    { label: "Today's appointments", prompt: "Show today's appointments" },
  ],
};

/** Entity-aware actions when the user is viewing a specific record (spec 6). */
const ENTITY_ACTIONS: Record<string, { label: string; prompt: string }[]> = {
  patient: [
    { label: 'Summarize patient', prompt: 'Summarize this patient' },
    { label: 'Recent visits', prompt: 'Show recent visits for this patient' },
    { label: 'Recent reports', prompt: 'Show recent reports for this patient' },
  ],
  doctor: [{ label: 'Open slots', prompt: 'Find available slots for this doctor' }],
};

const DEFAULT_QUICK = [
  { label: 'Bed status', prompt: 'How many beds are available?' },
  { label: 'Appointments', prompt: "Show today's appointments" },
  { label: 'Low stock', prompt: 'Show medicines with low stock' },
  { label: 'Open pharmacy', prompt: 'Open pharmacy' },
];

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function MaitriPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [routeKey, setRouteKey] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const recognitionRef = useRef<any>(null);

  // Re-derive quick actions when the underlying HMS screen changes — including
  // assistant-driven client-side navigations (§31.3 context awareness).
  useEffect(() => {
    const read = () => setRouteKey(window.location.pathname + window.location.search);
    read();
    const origPush = window.history.pushState.bind(window.history);
    const origReplace = window.history.replaceState.bind(window.history);
    window.history.pushState = (...args: any[]) => {
      origPush(...(args as Parameters<typeof origPush>));
      read();
    };
    window.history.replaceState = (...args: any[]) => {
      origReplace(...(args as Parameters<typeof origReplace>));
      read();
    };
    window.addEventListener('popstate', read);
    return () => {
      window.history.pushState = origPush;
      window.history.replaceState = origReplace;
      window.removeEventListener('popstate', read);
    };
  }, []);

  const moduleKey = useMemo(
    () => routeKey.split('?')[0].split('/')[1] || 'dashboard',
    [routeKey],
  );

  const quickActions = useMemo(() => {
    // On a record screen (e.g. /patients/123) offer record-specific actions.
    const ctx = collectMaitriContext();
    if (ctx.currentEntity && ctx.currentEntityId) {
      const entityActions = ENTITY_ACTIONS[ctx.currentEntity];
      if (entityActions) return entityActions;
    }
    return QUICK_ACTIONS_BY_MODULE[moduleKey] ?? DEFAULT_QUICK;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleKey]);

  // Keep the newest message visible while streaming.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, busy]);

  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  // Cancel any in-flight turn when the panel unmounts (request cancellation).
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      const ctx = collectMaitriContext();
      setItems((prev) => [
        ...prev,
        { id: uid(), role: 'user', content: trimmed },
        { id: uid(), role: 'activity', content: 'Understanding', state: 'active' },
      ]);
      setInput('');
      setBusy(true);

      const controller = new AbortController();
      abortRef.current = controller;

      // Watchdog (§31.10/§31.13): if no event arrives within 45s, surface an
      // honest error instead of leaving the user in a stuck “thinking” state.
      // Real activity (thinking/tool/result events) keeps resetting it.
      let watchdog: ReturnType<typeof setTimeout> | null = null;
      const RESET_WATCHDOG_MS = 45_000;
      const resetWatchdog = () => {
        if (watchdog) clearTimeout(watchdog);
        watchdog = setTimeout(() => {
          controller.abort();
          patchLast((last) =>
            last.role === 'activity'
              ? {
                  id: last.id,
                  role: 'assistant' as const,
                  content:
                    'The HMS service is taking too long to respond. Please try again in a moment.',
                  state: 'error' as const,
                }
              : last,
          );
          setBusy(false);
        }, RESET_WATCHDOG_MS);
      };
      resetWatchdog();

      const patchLast = (fn: (last: ConversationItem) => ConversationItem | null) => {
        setItems((prev) => {
          if (prev.length === 0) return prev;
          const next = [...prev];
          const idx = next.length - 1;
          const updated = fn(next[idx]);
          if (updated === null) next.pop();
          else next[idx] = updated;
          return next;
        });
      };

      await streamMaitriChat(
        {
          message: trimmed,
          sessionId: sessionIdRef.current ?? undefined,
          context: ctx,
        },
        {
          onEvent: (ev) => {
            resetWatchdog();
            switch (ev.type) {
              case 'session':
                sessionIdRef.current = ev.sessionId;
                break;
              case 'thinking':
              case 'tool_start': {
                const label =
                  ev.type === 'thinking' ? ev.message : ev.label || ev.tool;
                patchLast((last) =>
                  last.role === 'activity' && last.state === 'active'
                    ? { ...last, content: label }
                    : last,
                );
                break;
              }
              case 'tool_result': {
                patchLast((last) =>
                  last.role === 'activity'
                    ? {
                        ...last,
                        state: ev.status === 'success' ? 'done' : 'error',
                        content:
                          ev.status === 'success'
                            ? `✓ ${last.content.replace(/^✓ /, '')}`
                            : `✕ ${last.content}`,
                      }
                    : last,
                );
                break;
              }
              case 'token': {
                // Replace the trailing activity row with the assistant reply.
                setItems((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.role === 'activity') next.pop();
                  next.push({ id: uid(), role: 'assistant', content: ev.content });
                  return next;
                });
                break;
              }
              case 'client_action': {
                if (ev.action === 'navigate' && ev.route) {
                  // §14: navigation is performed immediately — the assistant
                  // operates the HMS, it does not hand out instructions.
                  router.push(ev.route);
                  patchLast((last) =>
                    last.role === 'assistant'
                      ? { ...last, navigateTo: ev.route, navigateLabel: ev.label }
                      : last,
                  );
                }
                if (
                  (ev.action === 'form_open' || ev.action === 'form_update') &&
                  ev.route
                ) {
                  const fields = (ev.params as any)?.fields ?? {};
                  patchLast((last) =>
                    last.role === 'assistant'
                      ? {
                          ...last,
                          navigateTo: moduleRoute(ev.route),
                          navigateLabel: 'the form',
                          formHandoff: { module: ev.route, fields },
                        }
                      : last,
                  );
                }
                break;
              }
              case 'confirm_required': {
                setItems((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.role === 'activity') next.pop();
                  next.push({
                    id: uid(),
                    role: 'assistant',
                    content: ev.message,
                    confirm: { toolCallId: ev.toolCallId, message: ev.message },
                  });
                  return next;
                });
                break;
              }
              case 'error': {
                patchLast((last) =>
                  last.role === 'activity'
                    ? { id: last.id, role: 'assistant', content: ev.message, state: 'error' }
                    : last,
                );
                break;
              }
              case 'done':
              default:
                break;
            }
          },
          onError: (message) => {
            patchLast((last) =>
              last.role === 'activity'
                ? { id: last.id, role: 'assistant', content: message, state: 'error' }
                : last,
            );
          },
        },
        controller.signal,
      );

      if (watchdog) clearTimeout(watchdog);
      setBusy(false);
      abortRef.current = null;
    },
    [busy],
  );

  const runConfirm = useCallback(async (toolCallId: string, approved: boolean) => {
    const { confirmMaitriAction } = await import('@/lib/maitri-client');
    const result = await confirmMaitriAction(toolCallId, approved);
    setItems((prev) => {
      const next = prev.map((it) =>
        it.confirm?.toolCallId === toolCallId ? { ...it, confirm: undefined } : it,
      );
      next.push({
        id: uid(),
        role: 'assistant',
        content: result.ok ? result.reply ?? 'Done.' : result.error ?? 'Something went wrong.',
        state: result.ok ? 'done' : 'error',
      });
      return next;
    });
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setItems((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === 'activity') next.pop();
      return next;
    });
  }, []);

  // ---- voice input (Web Speech API, graceful fallback) ----------------------
  const toggleVoice = useCallback(() => {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      setItems((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'assistant',
          content: 'Voice input is not supported in this browser. Please type instead.',
          state: 'error',
        },
      ]);
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event: any) => {
      const text = event.results?.[0]?.[0]?.transcript ?? '';
      if (text) void send(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }, [listening, send]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  return (
    <>
      <div className="maitri-overlay" onClick={onClose} />
      <aside
        className="maitri-panel"
        role="dialog"
        aria-label="Maitri Assistant"
        aria-modal="false"
      >
        <header className="maitri-header">
          <div className="maitri-brand">
            <span className="maitri-spark" aria-hidden="true">✦</span>
            <span>
              <span className="maitri-title">Maitri Assistant</span>
              <span className="maitri-sub">AI Copilot • Powered by Gemma</span>
            </span>
          </div>
          <div className="maitri-header-actions">
            <button
              className="maitri-icon-btn"
              onClick={onClose}
              aria-label="Minimize Maitri Assistant"
              title="Minimize"
            >
              −
            </button>
          </div>
        </header>

        <div className="maitri-conversation" ref={scrollRef}>
          <MaitriConversation
            items={items}
            onNavigate={(route) => {
              onClose();
              router.push(route);
            }}
            onFormHandoff={(route, moduleKey, fields) => {
              try {
                sessionStorage.setItem(
                  'maitriFormPrefill',
                  JSON.stringify({ module: moduleKey, fields }),
                );
              } catch {
                /* storage unavailable — form still opens unpopulated */
              }
              onClose();
              router.push(route);
            }}
            onConfirm={runConfirm}
          />
        </div>

        <div className="maitri-quick">
          {quickActions.map((qa) => (
            <button
              key={qa.label}
              className="maitri-chip"
              onClick={() =>
                qa.prompt.endsWith(' ') ? setInput(qa.prompt) : void send(qa.prompt)
              }
              disabled={busy}
            >
              {qa.label}
            </button>
          ))}
        </div>

        <MaitriInput
          input={input}
          onInputChange={setInput}
          onKeyDown={onKeyDown}
          onSend={() => void send(input)}
          onStop={stop}
          onToggleVoice={toggleVoice}
          listening={listening}
          busy={busy}
        />
      </aside>
    </>
  );
}
