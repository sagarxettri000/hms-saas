import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReceiptModal from '@/components/ReceiptModal';

jest.mock('@/lib/api', () => ({ api: jest.fn() }));

import { api } from '@/lib/api';

const INVOICE = {
  id: 'inv1',
  invoiceNumber: 'INV-1',
  type: 'EMERGENCY',
  totalAmount: 100,
  paidAmount: 100,
  dueAmount: 0,
  subtotal: 100,
  items: [],
  payments: [{ id: 'pay1', amount: 100, method: 'CASH', paidAt: '2026-09-01T00:00:00.000Z' }],
  refunds: [],
  patient: { firstName: 'John', lastName: 'Doe' },
  tenant: { name: 'Test Hospital' },
};

describe('ReceiptModal — duplicate-print guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    (api as jest.Mock).mockResolvedValue({ data: INVOICE });
    (window as any).print = jest.fn();
  });

  it('prints once freely, then warns and enforces a 3s wait on the reprint', async () => {
    const user = userEvent.setup();
    render(<ReceiptModal invoice={{ id: 'inv1', type: 'EMERGENCY' }} onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText('Print invoice')).toBeInTheDocument());

    await user.click(screen.getByText('Print invoice'));
    expect(window.print).toHaveBeenCalledTimes(1);

    // Second attempt is intercepted by the duplicate-print warning.
    await user.click(screen.getByText('Print invoice'));
    expect(screen.getByText(/already been printed/i)).toBeInTheDocument();
    const waiting = screen.getByRole('button', { name: /Please wait/i });
    expect(waiting).toBeDisabled();

    // Only after the 3-second countdown can the user confirm.
    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Confirm print' })).toBeEnabled(),
      { timeout: 5000 },
    );
    await user.click(screen.getByRole('button', { name: 'Confirm print' }));
    expect(window.print).toHaveBeenCalledTimes(2);
  });

  it('hides the print action until the bill has a payment', async () => {
    (api as jest.Mock).mockResolvedValue({
      data: { ...INVOICE, id: 'inv2', paidAmount: 0, dueAmount: 100, payments: [] },
    });
    render(<ReceiptModal invoice={{ id: 'inv2', type: 'OPD' }} onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText('Close')).toBeInTheDocument());
    expect(screen.queryByText('Print invoice')).not.toBeInTheDocument();
    expect(screen.getByText(/No payment recorded yet/i)).toBeInTheDocument();
  });
});
