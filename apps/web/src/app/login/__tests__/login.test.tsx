import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '@/app/login/page';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}));

jest.mock('next/link', () => {
  return function MockLink({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>;
  };
});

jest.mock('@/lib/api', () => ({
  api: jest.fn(),
}));

import { api } from '@/lib/api';

describe('LoginPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  it('renders email and password fields', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows validation error when submitting empty password', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });
  });

  it('shows invalid-email error after blur with bad email', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    const email = screen.getByLabelText('Email');
    await user.type(email, 'not-an-email');
    await user.tab();
    expect(screen.getByText(/valid email/i)).toBeInTheDocument();
  });

  it('stores tokens and navigates to dashboard on successful login', async () => {
    const user = userEvent.setup();
    (api as jest.Mock).mockResolvedValue({
      data: {
        accessToken: 'at',
        refreshToken: 'rt',
        user: {
          firstName: 'Admin',
          lastName: 'User',
          role: 'HOSPITAL_ADMIN',
          tenantId: 'tenant-1',
          mustChangePassword: false,
        },
      },
    });

    render(<LoginPage />);
    await user.type(screen.getByLabelText('Email'), 'admin@hospital.com');
    await user.type(screen.getByLabelText('Password'), 'Secret123!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(window.localStorage.getItem('accessToken')).toBe('at');
      expect(window.localStorage.getItem('tenantId')).toBe('tenant-1');
    });
  });

  it('shows friendly error on invalid credentials', async () => {
    const user = userEvent.setup();
    (api as jest.Mock).mockRejectedValue(new Error('Unauthorized'));

    render(<LoginPage />);
    await user.type(screen.getByLabelText('Email'), 'admin@hospital.com');
    await user.type(screen.getByLabelText('Password'), 'WrongPass1');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/email or password is incorrect/i)).toBeInTheDocument();
    });
  });

  it('navigates to change-password when mustChangePassword is set', async () => {
    const push = jest.fn();
    (jest.requireMock('next/navigation').useRouter as jest.Mock).mockImplementation(() => ({ push }));

    (api as jest.Mock).mockResolvedValue({
      data: {
        accessToken: 'at',
        refreshToken: 'rt',
        user: {
          firstName: 'Admin',
          lastName: 'User',
          role: 'HOSPITAL_ADMIN',
          tenantId: 'tenant-1',
          mustChangePassword: true,
        },
      },
    });

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@hospital.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Secret123!' } });
    fireEvent.submit(screen.getByRole('button', { name: /sign in/i }).closest('form')!);

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/change-password');
    });
  });
});
