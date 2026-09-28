'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MaitriStreamEvent } from '@hms/shared';
import { collectMaitriContext, streamMaitriChat } from '@/lib/maitri-client';

interface ConversationItem {
  id: string;
  role: 'user' | 'assistant' | 'activity';
  content: string;
  state?: 'active' | 'done' | 'error';
  navigateTo?: string;
  navigateLabel?: string;
  confirm?: {
    toolCallId: string;
    message: string;
  };
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

  // Re-derive quick actions when the underlying HMS screen changes.
  useEffect(() => {
    setRouteKey(window.location.pathname + window.location.search);
  }, []);

  const moduleKey = useMemo(
    () => routeKey.split('?')[0].split('/')[1] || 'dashboard',
    [routeKey],
  );

  const quickActions = useMemo(
    () => QUICK_ACTIONS_BY_MODULE[moduleKey] ?? DEFAULT_QUICK,
    [moduleKey],
  );

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
                  patchLast((last) =>
                    last.role === 'assistant'
                      ? { ...last, navigateTo: ev.route, navigateLabel: ev.label }
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
          {items.length === 0 ? (
            <div className="maitri-empty">
              <div className="maitri-empty-title">✦ Maitri Assistant</div>
              <div className="maitri-empty-sub">Your HMS, easier to use.</div>
              <div className="maitri-empty-list">
                <div>Ask me to:</div>
                <div>• Find a patient</div>
                <div>• Open an HMS module</div>
                <div>• Check appointments or beds</div>
                <div>• Perform authorized HMS actions</div>
              </div>
            </div>
          ) : (
            items.map((item) => {
              if (item.role === 'activity') {
                return (
                  <div key={item.id} className={`maitri-activity ${item.state ?? ''}`}>
                    <span className="maitri-activity-dot" aria-hidden="true" />
                    <span>{item.content}</span>
                    {item.state === 'active' && (
                      <span className="maitri-dots" aria-hidden="true">
                        <i /><i /><i />
                      </span>
                    )}
                  </div>
                );
              }
              if (item.role === 'user') {
                return (
                  <div key={item.id} className="maitri-msg-user">
                    {item.content}
                  </div>
                );
              }
              return (
                <div
                  key={item.id}
                  className={`maitri-msg-ai ${item.state === 'error' ? 'error' : ''}`}
                >
                  <div className="maitri-msg-text">{item.content}</div>
                  {item.navigateTo && (
                    <button
                      className="maitri-link-btn"
                      onClick={() => {
                        onClose();
                        router.push(item.navigateTo!);
                      }}
                    >
                      {item.navigateLabel ? `Open ${item.navigateLabel}` : 'Open'}
                    </button>
                  )}
                  {item.confirm && (
                    <div className="maitri-confirm-row">
                      <button
                        className="btn btn-sm maitri-btn-danger"
                        onClick={() => runConfirm(item.confirm!.toolCallId, true)}
                      >
                        Confirm
                      </button>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => runConfirm(item.confirm!.toolCallId, false)}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
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

        <div className="maitri-inputbar">
          <button
            className={`maitri-mic ${listening ? 'listening' : ''}`}
            onClick={toggleVoice}
            aria-label={listening ? 'Stop listening' : 'Start voice input'}
            title={listening ? 'Stop listening' : 'Voice input'}
            type="button"
          >
            {listening ? '●' : '🎙'}
          </button>
          <textarea
            ref={inputRef}
            className="maitri-input"
            placeholder={listening ? 'Listening…' : 'Ask Maitri anything in HMS…'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            aria-label="Message Maitri Assistant"
            disabled={busy}
          />
          {busy ? (
            <button className="maitri-send stop" onClick={stop} aria-label="Stop generating">
              ■
            </button>
          ) : (
            <button
              className="maitri-send"
              onClick={() => void send(input)}
              disabled={!input.trim()}
              aria-label="Send message"
            >
              ➤
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
