import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from '../src/components/LoginForm.js';

const username = () => screen.getByLabelText(/^Username/);
const role = () => screen.getByLabelText(/^Role/);
const errorFor = (control: HTMLElement) =>
  within(control.closest('label')!).queryByRole('alert')?.textContent;

function renderForm(onSubmit = vi.fn(async () => undefined)) {
  const user = userEvent.setup();
  render(<LoginForm onSubmit={onSubmit} />);
  return { user, onSubmit };
}

describe('LoginForm', () => {
  it('defaults the role to trader', () => {
    renderForm();

    expect(role()).toHaveValue('trader');
  });

  it('submits the trimmed username and the chosen role', async () => {
    const { user, onSubmit } = renderForm();

    await user.type(username(), '  vwong ');
    await user.selectOptions(role(), 'viewer');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ username: 'vwong', role: 'viewer' });
  });

  it('shows the shared schema message for a blank username and does not submit', async () => {
    const { user, onSubmit } = renderForm();

    await user.type(username(), '   ');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(errorFor(username())).toBe('username is required');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps the input when onSubmit rejects', async () => {
    const { user } = renderForm(vi.fn(async () => Promise.reject(new Error('nope'))));

    await user.type(username(), 'asmith');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(username()).toHaveValue('asmith');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });
});
