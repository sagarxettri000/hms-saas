'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/hooks';
import { PAYMENT_METHODS } from '@/lib/options';
import type { Row } from '@/lib/types';

function makeIdempotencyKey() {
  return `pay-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function PaymentModal({
  invoice,
  onClose,
  onDone,
}: {
  invoice: Row;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState<number>(Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0) || 0);
  const [method, setMethod] = useState('CASH');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(makeIdempotencyKey);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || amount <= 0) {
      setError('Enter a valid amount');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api('/billing/payments', {
        method: 'POST',
        body: JSON.stringify({
          patientId: invoice.patient?.id,
          invoiceId: invoice.id,
          amount: Number(amount),
          method,
          referenceNumber,
          notes,
          idempotencyKey,
        }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment');
      setSaving(false);
    }
  }

  const outstanding = Math.max(0, Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Record payment</h3>
        <p className="muted">
          Invoice <span className="mono">{invoice.invoiceNumber}</span> · Total{' '}
          {formatMoney(invoice.totalAmount)} · Unpaid bills {formatMoney(outstanding)}
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
          <div className="field">
            <label className="label">Amount</label>
            <input
              className="input"
              type="number"
              step="0.01"
              min={0}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              required
            />
          </div>
          <div className="field">
            <label className="label">Method</label>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Reference / Txn no.</label>
            <input className="input" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Notes</label>
            <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error && <p style={{ margin: 0, color: 'var(--danger)', fontSize: 13 }}>{error}</p>}

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={saving}>
              {saving ? 'Recording…' : 'Save payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
