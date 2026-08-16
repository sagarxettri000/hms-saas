import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportViewer from '@/components/reports/ReportViewer';

jest.mock('@/lib/api', () => ({
  api: jest.fn(),
  API_URL: 'http://test/api/v1',
}));

import { api } from '@/lib/api';

const DEF = {
  id: 'credit-sales',
  number: '2.4',
  name: 'CREDIT SALES REPORT',
  category: 'REVENUE',
  description: 'Credit and outstanding invoices',
  filters: ['fromDate', 'toDate', 'department', 'search'],
  columns: [
    { key: 'invoiceNumber', label: 'Invoice', type: 'string' },
    { key: 'gross', label: 'Gross', type: 'money', align: 'right', total: true },
  ],
};

const GENERATED = {
  report: {
    id: 'credit-sales',
    number: '2.4',
    name: 'CREDIT SALES REPORT',
    category: 'REVENUE',
    description: 'Credit and outstanding invoices',
  },
  meta: {
    generatedAt: '2026-08-16T08:00:00.000Z',
    filters: { Period: '2026-08-01 to 2026-08-31' },
    hospital: { name: 'Test Hospital', address: '', city: 'Kathmandu' },
    user: 'Ada Lovelace',
  },
  columns: DEF.columns,
  rows: [{ invoiceNumber: 'INV-1', gross: 100 }],
  totals: { gross: 100 },
  cards: [{ label: 'Invoices', value: 1 }],
  chart: null,
  count: 1,
};

function mockApi() {
  (api as jest.Mock).mockImplementation((path: string) => {
    if (path === '/reports/analysis/credit-sales') return Promise.resolve({ data: { data: DEF } });
    if (path === '/reports/analysis/options?name=department') return Promise.resolve({ data: { data: [] } });
    if (path === '/reports/analysis/credit-sales/generate') return Promise.resolve({ data: { data: GENERATED } });
    return Promise.resolve({ data: { data: [] } });
  });
}

describe('ReportViewer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  it('renders a placeholder when no report is selected', () => {
    render(<ReportViewer reportId={null} />);
    expect(screen.getByText(/select a report/i)).toBeInTheDocument();
  });

  it('loads the definition and renders filters and generate button', async () => {
    mockApi();
    render(<ReportViewer reportId="credit-sales" />);
    await waitFor(() => {
      expect(screen.getByText(/CREDIT SALES REPORT/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText('From date')).toBeInTheDocument();
    expect(screen.getByLabelText('To date')).toBeInTheDocument();
    expect(screen.getByLabelText('Department')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate/i })).toBeInTheDocument();
  });

  it('generates and renders rows and totals', async () => {
    mockApi();
    const user = userEvent.setup();
    render(<ReportViewer reportId="credit-sales" />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /generate/i }));
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith(
        '/reports/analysis/credit-sales/generate',
        expect.objectContaining({ method: 'POST', body: expect.stringContaining('fromDate') }),
      );
      expect(screen.getByText('INV-1')).toBeInTheDocument();
      expect(screen.getAllByText('Rs. 100.00').length).toBeGreaterThan(0);
      expect(screen.getByText(/Test Hospital, Kathmandu/i)).toBeInTheDocument();
      expect(screen.getByText('1 record')).toBeInTheDocument();
    });
  });

  it('shows an empty state when generate returns no rows', async () => {
    mockApi();
    (api as jest.Mock).mockImplementation((path: string) => {
      if (path === '/reports/analysis/credit-sales') return Promise.resolve({ data: { data: DEF } });
      if (path === '/reports/analysis/credit-sales/generate') {
        return Promise.resolve({ data: { data: { ...GENERATED, rows: [], count: 0, totals: {} } } });
      }
      return Promise.resolve({ data: { data: [] } });
    });
    const user = userEvent.setup();
    render(<ReportViewer reportId="credit-sales" />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /generate/i }));
    await waitFor(() => {
      expect(screen.getByText(/no records found/i)).toBeInTheDocument();
    });
  });
});
