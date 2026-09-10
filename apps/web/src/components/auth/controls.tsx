'use client';

import { useState } from 'react';

export function AuthField({
  id,
  label,
  type = 'text',
  value,
  onChange,
  onBlurHandled,
  placeholder,
  error,
  autoComplete,
  inputMode,
  children,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  onBlurHandled?: () => void;
  placeholder?: string;
  error?: string | null;
  autoComplete?: string;
  inputMode?: 'text' | 'numeric' | 'email' | 'tel' | 'url';
  children?: React.ReactNode;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword && showPassword ? 'text' : type;

  return (
    <div className={`auth-field ${error ? 'auth-field-error' : ''}`}>
      <label className="auth-label" htmlFor={id}>
        {label}
      </label>
      <div className={`auth-input-wrap ${isPassword ? 'auth-input-password' : ''}`}>
        <input
          id={id}
          type={inputType}
          className="auth-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlurHandled}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {isPassword && (
          <button
            type="button"
            className="auth-password-toggle"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            tabIndex={0}
          >
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                <circle cx="12" cy="12" r="2.6" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                <circle cx="12" cy="12" r="2.6" />
                <line x1="3" y1="3" x2="21" y2="21" />
              </svg>
            )}
          </button>
        )}
        {children}
      </div>
      {error && (
        <p className="auth-field-error-text" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function AuthCheckbox({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="auth-check" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="auth-check-input"
      />
      <span className="auth-check-box" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      <span className="auth-check-label">{children}</span>
    </label>
  );
}

export function AuthButton({
  loading,
  children,
  loadingText,
}: {
  loading: boolean;
  children: React.ReactNode;
  loadingText: string;
}) {
  return (
    <button
      type="submit"
      className="auth-btn"
      disabled={loading}
      aria-busy={loading}
    >
      {loading ? (
        <>
          <span className="auth-spinner" aria-hidden="true" />
          {loadingText}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function AuthError({ message }: { message: string }) {
  return (
    <p className="auth-alert auth-alert-error" role="alert">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      {message}
    </p>
  );
}

export function AuthMessage({ message }: { message: string }) {
  return (
    <p className="auth-alert auth-alert-success" role="status">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
      {message}
    </p>
  );
}