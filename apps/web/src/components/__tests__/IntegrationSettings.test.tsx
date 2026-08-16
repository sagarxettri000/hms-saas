import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import IntegrationSettings from '@/components/IntegrationSettings';

jest.mock('@/lib/api', () => ({
  api: jest.fn(),
}));

import { api } from '@/lib/api';

const mockIntegrations = [
  {
    provider: 'SMTP_EMAIL',
    config: { host: 'smtp.example.com', port: 587 },
    enabled: true,
  },
  {
    provider: 'SMS_GATEWAY',
    config: {},
    enabled: false,
  },
];

describe('IntegrationSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api as jest.Mock).mockResolvedValue({ data: mockIntegrations });
  });

  it('lists known providers with enabled state', async () => {
    render(<IntegrationSettings />);
    expect(await screen.findByText('Email (SMTP)')).toBeInTheDocument();
    expect(screen.getByText('SMS')).toBeInTheDocument();
    const toggles = screen.getAllByRole('button', { name: /enabled|disabled/i });
    expect(toggles.length).toBeGreaterThanOrEqual(2);
  });

  it('opens the config form for a provider', async () => {
    render(<IntegrationSettings />);
    await screen.findByText('Email (SMTP)');
    const buttons = screen.getAllByRole('button', { name: /configure/i });
    fireEvent.click(buttons[0]);
    expect(screen.getByLabelText('SMTP host')).toBeInTheDocument();
    expect(screen.getByLabelText('Port')).toBeInTheDocument();
  });

  it('saves config and closes the form', async () => {
    (api as jest.Mock).mockResolvedValue({ data: mockIntegrations });
    render(<IntegrationSettings />);
    await screen.findByText('Email (SMTP)');
    fireEvent.click(screen.getAllByRole('button', { name: /configure/i })[0]);
    fireEvent.change(screen.getByLabelText('SMTP host'), {
      target: { value: 'smtp2.example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save config/i }));
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith(
        '/settings/integrations/SMTP_EMAIL',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByText(/save config/i)).not.toBeInTheDocument();
    });
  });

  it('toggles a provider on/off', async () => {
    render(<IntegrationSettings />);
    await screen.findByText('Email (SMTP)');
    fireEvent.click(screen.getByRole('button', { name: /enabled/i }));
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith(
        '/settings/integrations/SMTP_EMAIL',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });
});
