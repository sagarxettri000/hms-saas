'use client';

import type { ConversationItem } from './types';

/**
 * MaitriConversation — renders the streamed conversation: activity states,
 * user messages, assistant replies, navigation/form buttons, confirmations.
 * Pure presentation; state lives in MaitriPanel.
 */
export default function MaitriConversation({
  items,
  onNavigate,
  onFormHandoff,
  onConfirm,
}: {
  items: ConversationItem[];
  onNavigate: (route: string) => void;
  onFormHandoff: (route: string, module: string, fields: Record<string, unknown>) => void;
  onConfirm: (toolCallId: string, approved: boolean) => void;
}) {
  if (items.length === 0) {
    return (
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
    );
  }
  return (
    <>
      {items.map((item) => {
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
            <div className="maitri-msg-text maitri-pre">{item.content}</div>
            {item.navigateTo && !item.formHandoff && (
              <button className="maitri-link-btn" onClick={() => onNavigate(item.navigateTo!)}>
                {item.navigateLabel ? `Open ${item.navigateLabel}` : 'Open'}
              </button>
            )}
            {item.navigateTo && item.formHandoff && (
              <button
                className="maitri-link-btn"
                onClick={() => onFormHandoff(item.navigateTo!, item.formHandoff!.module, item.formHandoff!.fields)}
              >
                {`Open ${item.navigateLabel ?? 'form'}`}
              </button>
            )}
            {item.confirm && (
              <div className="maitri-confirm-row">
                <button className="btn btn-sm maitri-btn-danger" onClick={() => onConfirm(item.confirm!.toolCallId, true)}>
                  Confirm
                </button>
                <button className="btn btn-sm btn-secondary" onClick={() => onConfirm(item.confirm!.toolCallId, false)}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
