'use client';

import { API_URL } from '@/lib/api';
import type { MaitriChatRequest, MaitriStreamEvent } from '@hms/shared';

/**
 * Maitri Assistant client transport.
 *
 * The chat endpoint streams SSE frames (POST + text/event-stream, same
 * credentials/tenant headers as the rest of the HMS API). Parsed events are
 * pushed to a callback so the panel can render thinking/tool activity and the
 * final reply incrementally. Request cancellation aborts the fetch, which
 * closes the server stream (spec: request cancellation, no orphaned turns).
 */

export interface MaitriStreamHandlers {
  onEvent: (event: MaitriStreamEvent) => void;
  onError?: (message: string) => void;
}

export async function streamMaitriChat(
  request: MaitriChatRequest,
  handlers: MaitriStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const tenantId =
    typeof window !== 'undefined' ? localStorage.getItem('tenantId') : null;

  let res: Response;
  try {
    res = await fetch(`${API_URL}/ai/chat`, {
      method: 'POST',
      credentials: 'include',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-HMS-CSRF': '1',
        ...(tenantId ? { 'X-Tenant-ID': tenantId } : {}),
      },
      body: JSON.stringify(request),
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') return;
    handlers.onError?.('I could not reach the Maitri Assistant service.');
    return;
  }

  if (res.status === 401) {
    handlers.onError?.('Your session has expired. Please sign in again.');
    return;
  }
  if (!res.ok || !res.body) {
    handlers.onError?.('The assistant service returned an error.');
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            handlers.onEvent(JSON.parse(payload) as MaitriStreamEvent);
          } catch {
            // ignore malformed frame
          }
        }
      }
    }
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      handlers.onError?.('The assistant stream was interrupted.');
    }
  }
}

/** Resolve a pending confirmation (destructive actions). */
export async function confirmMaitriAction(
  toolCallId: string,
  approved: boolean,
): Promise<{ ok: boolean; reply?: string; error?: string }> {
  const tenantId =
    typeof window !== 'undefined' ? localStorage.getItem('tenantId') : null;
  try {
    const res = await fetch(`${API_URL}/ai/confirm`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-HMS-CSRF': '1',
        ...(tenantId ? { 'X-Tenant-ID': tenantId } : {}),
      },
      body: JSON.stringify({ toolCallId, approved }),
    });
    if (!res.ok) return { ok: false, error: 'The assistant service returned an error.' };
    return await res.json();
  } catch {
    return { ok: false, error: 'I could not reach the Maitri Assistant service.' };
  }
}

/**
 * Context of the current HMS screen, sent with every turn so the assistant
 * knows what the user is looking at. Authorization is ALWAYS recomputed
 * server-side; this is a convenience hint only.
 */
export function collectMaitriContext() {
  if (typeof window === 'undefined') return {};
  const path = window.location.pathname;
  const patientMatch = path.match(/^\/patients\/([^/]+)$/);
  const doctorMatch = path.match(/^\/doctors\/([^/]+)$/);
  let entity: string | undefined;
  let entityId: string | undefined;
  if (patientMatch) {
    entity = 'patient';
    entityId = patientMatch[1];
  } else if (doctorMatch) {
    entity = 'doctor';
    entityId = doctorMatch[1];
  }
  return {
    currentRoute: path + (window.location.search || ''),
    currentModule: path.split('/')[1] || 'dashboard',
    currentEntity: entity,
    currentEntityId: entityId,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
