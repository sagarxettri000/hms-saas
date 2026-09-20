'use client';

import { useEffect, useRef, useState } from 'react';
import { api, listOf } from '@/lib/api';
import type { ApiResponse } from '@/lib/types';

interface AsyncSearchSelectProps {
  endpoint: string;
  valueKey?: string;
  labelKeys?: string[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

function formatLabel(item: Record<string, any>, keys: string[]): string {
  return keys
    .map((k) => k.split('.').reduce((o: any, p) => o?.[p], item))
    .filter(Boolean)
    .join(' ') || item.id;
}

export default function AsyncSearchSelect({
  endpoint,
  valueKey = 'id',
  labelKeys = ['name'],
  value,
  onChange,
  placeholder = 'Type to search...',
  required,
  disabled,
}: AsyncSearchSelectProps) {
  const [query, setQuery] = useState('');
  const [displayLabel, setDisplayLabel] = useState('');
  const [results, setResults] = useState<Record<string, any>[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (!value) {
      setDisplayLabel('');
      return;
    }
    let active = true;
    (async () => {
      try {
        const res: ApiResponse<any> = await api(`${endpoint}/${value}`);
        const item = (res.data as any)?.data ?? res.data;
        if (item && active) setDisplayLabel(formatLabel(item, labelKeys));
      } catch {
        setDisplayLabel(String(value));
      }
    })();
    return () => { active = false; };
  }, [value, endpoint, valueKey]);

  function search(term: string) {
    if (timer.current) clearTimeout(timer.current);
    if (!term.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const qs = new URLSearchParams({ limit: '12', search: term.trim() });
        const res: ApiResponse<any> = await api(`${endpoint}?${qs.toString()}`);
        const list = listOf(res);
        setResults(list);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
  }

  function handleQueryChange(v: string) {
    setQuery(v);
    setDisplayLabel('');
    search(v);
  }

  function handleSelect(item: Record<string, any>) {
    const val = item[valueKey];
    onChange(val);
    setDisplayLabel(formatLabel(item, labelKeys));
    setQuery('');
    setResults([]);
    setOpen(false);
  }

  function handleClear() {
    onChange('');
    setQuery('');
    setDisplayLabel('');
    setResults([]);
    setOpen(false);
  }

  const inputValue = displayLabel || query;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          className="input"
          style={{ width: '100%', paddingRight: value ? 28 : undefined }}
          value={inputValue}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => { if (results.length) setOpen(true); }}
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, lineHeight: 1, padding: 2 }}
            aria-label="Clear"
          >
            ×
          </button>
        )}
      </div>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 30,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            maxHeight: 260,
            overflowY: 'auto',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            marginTop: 4,
          }}
        >
          {searching && results.length === 0 ? (
            <div className="note" style={{ padding: 10 }}>Searching...</div>
          ) : results.length === 0 ? (
            <div className="note" style={{ padding: 10 }}>No results found</div>
          ) : (
            results.map((item) => (
              <button
                key={item[valueKey]}
                type="button"
                onClick={() => handleSelect(item)}
                style={{
                  display: 'flex',
                  width: '100%',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  background: item[valueKey] === value ? 'var(--bg)' : 'transparent',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                <span style={{ flex: 1 }}>{formatLabel(item, labelKeys)}</span>
                {item[valueKey] === value && (
                  <span className="badge badge-blue" style={{ fontSize: 10 }}>selected</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
