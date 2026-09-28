'use client';

/**
 * MaitriInput — voice button, text area, send/stop controls.
 * Presentational component; send logic lives in MaitriPanel (spec 26).
 */
export default function MaitriInput({
  input,
  onInputChange,
  onKeyDown,
  onSend,
  onStop,
  onToggleVoice,
  listening,
  busy,
}: {
  input: string;
  onInputChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onStop: () => void;
  onToggleVoice: () => void;
  listening: boolean;
  busy: boolean;
}) {
  return (
    <div className="maitri-inputbar">
      <button
        className={`maitri-mic ${listening ? 'listening' : ''}`}
        onClick={onToggleVoice}
        aria-label={listening ? 'Stop listening' : 'Start voice input'}
        title={listening ? 'Stop listening' : 'Voice input'}
        type="button"
      >
        {listening ? '●' : '🎙'}
      </button>
      <textarea
        className="maitri-input"
        placeholder={listening ? 'Listening…' : 'Ask Maitri anything in HMS…'}
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        aria-label="Message Maitri Assistant"
        disabled={busy}
      />
      {busy ? (
        <button className="maitri-send stop" onClick={onStop} aria-label="Stop generating">
          ■
        </button>
      ) : (
        <button
          className="maitri-send"
          onClick={onSend}
          disabled={!input.trim()}
          aria-label="Send message"
        >
          ➤
        </button>
      )}
    </div>
  );
}
