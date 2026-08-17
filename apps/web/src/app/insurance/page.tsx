'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { formatMoney, formatDateTime } from '@/lib/hooks';
import { PATIENT_REF, PROVIDER_REF } from '@/lib/options';
import ModulePage from '@/components/ModulePage';

type Tab = 'providers' | 'policies' | 'claims';

export default function InsurancePage() {
  const [activeTab, setActiveTab] = useState<Tab>('claims');
  const [providers, setProviders] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);

  const tabBtn = (key: Tab, label: string) => (
    <button className="btn btn-sm" style={{ background: activeTab === key ? 'var(--primary)' : 'var(--bg-secondary)', color: activeTab === key ? '#fff' : undefined }} onClick={() => setActiveTab(key)}>{label}</button>
  );

  useEffect(() => {
    api('/insurance/providers?limit=500').then((r) => setProviders(r?.data?.data ?? r?.data ?? [])).catch(() => {});
    api('/patients?limit=500').then((r) => setPatients(r?.data?.data ?? r?.data ?? [])).catch(() => {});
  }, []);

  const STATUS_COLORS: Record<string, string> = {
    DRAFT: 'var(--muted)', SUBMITTED: 'var(--info)', PROCESSING: 'var(--warning)',
    APPROVED: 'var(--success)', REJECTED: 'var(--danger)', SETTLED: 'var(--success)',
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {tabBtn('claims', 'Claims')}
        {tabBtn('policies', 'Policies')}
        {tabBtn('providers', 'Providers')}
      </div>

      {activeTab === 'providers' && (
        <ModulePage
          title="Insurance Providers"
          subtitle="Manage insurance companies and TPAs"
          endpoint="/insurance/providers"
          createLabel="Add provider"
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'code', label: 'Code', render: (r) => <span className="mono">{r.code || '—'}</span> },
            { key: 'type', label: 'Type', badge: true },
            { key: 'contactPerson', label: 'Contact', render: (r) => r.contactPerson || '—' },
            { key: 'phone', label: 'Phone', render: (r) => r.phone || '—' },
            { key: 'email', label: 'Email', render: (r) => r.email || '—' },
            { key: 'isActive', label: 'Status', badge: true, render: (r) => (r.isActive ? 'ACTIVE' : 'INACTIVE') },
          ]}
          fields={[
            { name: 'name', label: 'Name', required: true },
            { name: 'code', label: 'Code' },
            { name: 'type', label: 'Type', type: 'select', options: [{ value: 'NATIONAL', label: 'National' }, { value: 'PRIVATE', label: 'Private' }, { value: 'TPA', label: 'TPA' }, { value: 'EMPLOYER', label: 'Employer' }] },
            { name: 'contactPerson', label: 'Contact person' },
            { name: 'phone', label: 'Phone' },
            { name: 'email', label: 'Email', type: 'email' },
            { name: 'address', label: 'Address', type: 'textarea', full: true },
          ]}
        />
      )}

      {activeTab === 'policies' && (
        <ModulePage
          title="Insurance Policies"
          subtitle="Patient insurance policies"
          endpoint="/insurance/policies"
          createLabel="Add policy"
          columns={[
            { key: 'policyNumber', label: 'Policy #', render: (r) => <span className="mono">{r.policyNumber}</span> },
            { key: 'patient', label: 'Patient', render: (r) => [r.patient?.firstName, r.patient?.lastName].filter(Boolean).join(' ') || r.patientId },
            { key: 'provider', label: 'Provider', render: (r) => r.provider?.name || '—' },
            { key: 'memberId', label: 'Member ID', render: (r) => r.memberId || '—' },
            { key: 'coverageLimit', label: 'Limit', render: (r) => r.coverageLimit ? formatMoney(r.coverageLimit) : '—' },
            { key: 'expiryDate', label: 'Expires', render: (r) => r.expiryDate?.slice(0, 10) || '—' },
            { key: 'status', label: 'Status', badge: true },
          ]}
          fields={[
            { name: 'patientId', label: 'Patient', required: true, type: 'select', optionsFrom: PATIENT_REF },
            { name: 'providerId', label: 'Provider', required: true, type: 'select', options: providers.map((p: any) => ({ value: p.id, label: p.name })) },
            { name: 'policyNumber', label: 'Policy Number', required: true },
            { name: 'groupNumber', label: 'Group Number' },
            { name: 'memberId', label: 'Member ID' },
            { name: 'coverageLimit', label: 'Coverage Limit', type: 'number' },
            { name: 'startDate', label: 'Start Date', type: 'date' },
            { name: 'expiryDate', label: 'Expiry Date', type: 'date' },
          ]}
        />
      )}

      {activeTab === 'claims' && (
        <ModulePage
          title="Insurance Claims"
          subtitle="Track and manage insurance claims"
          endpoint="/insurance/claims"
          createLabel="New claim"
          columns={[
            { key: 'claimNumber', label: 'Claim #', render: (r) => <span className="mono">{r.claimNumber}</span> },
            { key: 'patient', label: 'Patient', render: (r) => [r.patient?.firstName, r.patient?.lastName].filter(Boolean).join(' ') || r.patientId },
            { key: 'provider', label: 'Provider', render: (r) => r.provider?.name || '—' },
            { key: 'claimAmount', label: 'Claimed', render: (r) => formatMoney(r.claimAmount) },
            { key: 'approvedAmount', label: 'Approved', render: (r) => r.approvedAmount ? formatMoney(r.approvedAmount) : '—' },
            {
              key: 'status', label: 'Status', badge: true,
              render: (r) => <span className="badge" style={{ background: STATUS_COLORS[r.status] || 'var(--muted)', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{r.status}</span>,
            },
            { key: 'submittedAt', label: 'Submitted', render: (r) => r.submittedAt?.slice(0, 10) || '—' },
          ]}
          fields={[
            { name: 'patientId', label: 'Patient', required: true, type: 'select', optionsFrom: PATIENT_REF },
            { name: 'providerId', label: 'Provider', type: 'select', options: providers.map((p: any) => ({ value: p.id, label: p.name })) },
            { name: 'policyId', label: 'Policy', type: 'select', optionsFrom: { valueKey: 'id', labelKeys: ['policyNumber'], endpoint: '/insurance/policies' } },
            { name: 'invoiceId', label: 'Invoice', type: 'select', optionsFrom: { valueKey: 'id', labelKeys: ['invoiceNumber'], endpoint: '/billing/invoices' } },
            { name: 'claimAmount', label: 'Claim Amount', type: 'number', required: true },
            { name: 'notes', label: 'Notes', type: 'textarea', full: true },
          ]}
          actions={[
            {
              label: 'Submit', tone: 'primary',
              onClick: async (r) => { await api(`/insurance/claims/${r.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'SUBMITTED' }) }); },
              condition: (r) => r.status === 'DRAFT',
            },
            {
              label: 'Process', tone: 'secondary',
              onClick: async (r) => { await api(`/insurance/claims/${r.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'PROCESSING' }) }); },
              condition: (r) => r.status === 'SUBMITTED',
            },
            {
              label: 'Approve', tone: 'primary',
              onClick: async (r) => { const amt = prompt('Approved amount:'); if (amt) { await api(`/insurance/claims/${r.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'APPROVED', approvedAmount: parseFloat(amt) }) }); } },
              condition: (r) => r.status === 'PROCESSING' || r.status === 'SUBMITTED',
            },
            {
              label: 'Reject',
              onClick: async (r) => { const reason = prompt('Rejection reason:'); if (reason) { await api(`/insurance/claims/${r.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'REJECTED', rejectionReason: reason }) }); } },
              condition: (r) => r.status === 'PROCESSING' || r.status === 'SUBMITTED',
            },
            {
              label: 'Settle', tone: 'primary',
              onClick: async (r) => { await api(`/insurance/claims/${r.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'SETTLED' }) }); },
              condition: (r) => r.status === 'APPROVED',
            },
          ]}
        />
      )}
    </>
  );
}
