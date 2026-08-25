'use client';

import ModulePage from '@/components/ModulePage';
import { formatDateTime } from '@/lib/hooks';
import { PATIENT_REF } from '@/lib/options';

export default function CrmPage() {
  return (
    <ModulePage
      title="CRM"
      subtitle="Enquiries, medical tourism & content"
      tabs={[
        {
          key: 'enquiries',
          label: 'Enquiries',
          endpoint: '/crm/enquiries',
          createLabel: 'New enquiry',
          columns: [
            { key: 'name', label: 'Name' },
            { key: 'phone', label: 'Phone' },
            { key: 'email', label: 'Email' },
            { key: 'source', label: 'Source', badge: true },
            { key: 'subject', label: 'Subject' },
            { key: 'status', label: 'Status', badge: true },
            { key: 'nextFollowUpAt', label: 'Next follow-up', render: (r) => r.nextFollowUpAt?.slice(0, 10) || '—' },
            { key: 'createdAt', label: 'Received', render: (r) => formatDateTime(r.createdAt) },
          ],
          fields: [
            { name: 'name', label: 'Name', required: true },
            { name: 'phone', label: 'Phone' },
            { name: 'email', label: 'Email', type: 'email' },
            { name: 'source', label: 'Source', type: 'select', options: [
              { value: 'WEBSITE', label: 'Website' },
              { value: 'PHONE', label: 'Phone' },
              { value: 'EMAIL', label: 'Email' },
              { value: 'WALK_IN', label: 'Walk-in' },
              { value: 'REFERRAL', label: 'Referral' },
              { value: 'SOCIAL_MEDIA', label: 'Social media' },
              { value: 'OTHER', label: 'Other' },
            ] },
            { name: 'subject', label: 'Subject' },
            { name: 'message', label: 'Message', type: 'textarea', full: true },
            { name: 'assignedTo', label: 'Assigned to' },
            { name: 'nextFollowUpAt', label: 'Next follow-up', type: 'date' },
            { name: 'notes', label: 'Notes', type: 'textarea', full: true },
          ],
        },
        {
          key: 'tourism',
          label: 'Medical Tourism',
          endpoint: '/crm/tourism',
          createLabel: 'New case',
          columns: [
            { key: 'caseNumber', label: 'Case no.', render: (r) => <span className="mono">{r.caseNumber || r.id.slice(0, 8)}</span> },
            { key: 'country', label: 'Country' },
            { key: 'treatmentInquiry', label: 'Treatment' },
            { key: 'estimatedCost', label: 'Est. cost' },
            { key: 'visaStatus', label: 'Visa', badge: true },
            { key: 'status', label: 'Status', badge: true },
          ],
          fields: [
            { name: 'patientId', label: 'Patient', type: 'searchSelect', optionsFrom: PATIENT_REF },
            {
              name: 'enquiryId',
              label: 'Enquiry',
              type: 'select',
              optionsFrom: { valueKey: 'id', labelKeys: ['name'], endpoint: '/crm/enquiries' },
            },
            { name: 'country', label: 'Country' },
            { name: 'language', label: 'Language' },
            { name: 'passportNumber', label: 'Passport number' },
            { name: 'treatmentInquiry', label: 'Treatment inquiry', type: 'textarea', full: true },
            { name: 'estimatedCost', label: 'Estimated cost', type: 'number' },
            { name: 'visaStatus', label: 'Visa status', type: 'select', options: [
              { value: 'NOT_APPLIED', label: 'Not applied' },
              { value: 'APPLIED', label: 'Applied' },
              { value: 'APPROVED', label: 'Approved' },
              { value: 'DENIED', label: 'Denied' },
            ] },
            { name: 'accommodation', label: 'Accommodation' },
            { name: 'transport', label: 'Transport' },
            { name: 'concierge', label: 'Concierge' },
            { name: 'assignedTo', label: 'Assigned to' },
          ],
        },
        {
          key: 'blog',
          label: 'Blog',
          endpoint: '/crm/blog',
          createLabel: 'New post',
          columns: [
            { key: 'title', label: 'Title' },
            { key: 'category', label: 'Category' },
            { key: 'author', label: 'Author', render: (r) => r.author?.name || r.authorId || '—' },
            { key: 'status', label: 'Status', badge: true },
            { key: 'scheduledAt', label: 'Scheduled', render: (r) => r.scheduledAt?.slice(0, 10) || '—' },
          ],
          fields: [
            { name: 'title', label: 'Title', required: true },
            { name: 'slug', label: 'Slug', required: true },
            { name: 'excerpt', label: 'Excerpt', type: 'textarea', full: true },
            { name: 'content', label: 'Content', type: 'textarea', required: true, full: true },
            { name: 'category', label: 'Category' },
            { name: 'featuredImage', label: 'Featured image URL' },
            {
              name: 'authorId',
              label: 'Author',
              type: 'select',
              optionsFrom: { valueKey: 'id', labelKeys: ['firstName', 'lastName'], endpoint: '/users' },
            },
            { name: 'seoTitle', label: 'SEO title' },
            { name: 'metaDescription', label: 'Meta description', type: 'textarea', full: true },
            { name: 'status', label: 'Status', type: 'select', options: [
              { value: 'DRAFT', label: 'Draft' },
              { value: 'PUBLISHED', label: 'Published' },
              { value: 'ARCHIVED', label: 'Archived' },
            ] },
            { name: 'scheduledAt', label: 'Scheduled at', type: 'date' },
          ],
        },
      ]}
    />
  );
}
