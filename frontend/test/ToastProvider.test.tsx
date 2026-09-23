import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import {
  MAX_TOASTS,
  TOAST_DURATION_MS,
  ToastProvider,
  useToast,
  type ToastVariant,
} from '../src/components/Toast/ToastProvider.js';

type ToastApi = ReturnType<typeof useToast>;

// Every render of the probe records the context value it saw, so tests can drive the API and
// assert on identity across renders.
function renderProvider() {
  const seen: ToastApi[] = [];
  function Probe() {
    seen.push(useToast());
    return null;
  }
  const view = render(
    <ToastProvider>
      <Probe />
    </ToastProvider>,
  );
  const api = () => seen[seen.length - 1]!;
  const show = (variant: ToastVariant, message: string) =>
    act(() => api().showToast(variant, message));
  return { ...view, seen, api, show, Probe };
}

const region = () => screen.getByRole('region', { name: 'Notifications' });
const messages = () =>
  Array.from(region().querySelectorAll('[role="status"], [role="alert"]')).map(
    (el) => el.textContent,
  );

beforeEach(() => {
  // Only fake setTimeout, so vi.getTimerCount() counts the provider's auto-dismiss timers and
  // nothing React schedules internally.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ToastProvider', () => {
  it('throws when useToast is used outside a ToastProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useToast())).toThrow(
      'useToast must be used within a ToastProvider',
    );
  });

  it('renders an empty notifications region before any toast', () => {
    renderProvider();
    expect(region()).toBeEmptyDOMElement();
  });

  it.each([
    ['info', 'bg-toast-info', 'status'],
    ['success', 'bg-toast-success', 'status'],
    ['error', 'bg-toast-error', 'alert'],
    ['connection', 'bg-toast-connection', 'status'],
  ] as const)('renders a %s toast with %s and role=%s', (variant, className, role) => {
    const { show } = renderProvider();
    show(variant, `A ${variant} message`);

    const toast = within(region()).getByRole(role);
    expect(toast).toHaveClass(className);
    expect(within(toast).getByText(`A ${variant} message`)).toBeInTheDocument();
    expect(screen.queryByRole(role === 'alert' ? 'status' : 'alert')).not.toBeInTheDocument();
  });

  it('auto-dismisses a toast after exactly TOAST_DURATION_MS', () => {
    const { show } = renderProvider();
    show('info', 'Trade created');

    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS - 1));
    expect(screen.getByText('Trade created')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('Trade created')).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stacks toasts in order and expires each on its own schedule', () => {
    const { show } = renderProvider();
    show('info', 'first');
    act(() => vi.advanceTimersByTime(1000));
    show('success', 'second');
    act(() => vi.advanceTimersByTime(1000));
    show('error', 'third');

    expect(messages()).toEqual(['first', 'second', 'third']);

    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS - 2000));
    expect(messages()).toEqual(['second', 'third']);

    act(() => vi.advanceTimersByTime(1000));
    expect(messages()).toEqual(['third']);

    act(() => vi.advanceTimersByTime(1000));
    expect(messages()).toEqual([]);
  });

  it('renders the same message twice as two separate toasts', () => {
    const consoleError = vi.spyOn(console, 'error');
    const { show } = renderProvider();
    show('connection', 'Connection lost, reconnecting…');
    show('connection', 'Connection lost, reconnecting…');

    expect(screen.getAllByText('Connection lost, reconnecting…')).toHaveLength(2);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('removes only the clicked toast and clears its timer', () => {
    const { show } = renderProvider();
    show('info', 'keep');
    show('success', 'remove');
    expect(vi.getTimerCount()).toBe(2);

    const target = screen.getByText('remove').closest('[role="status"]') as HTMLElement;
    fireEvent.click(within(target).getByRole('button', { name: 'Dismiss notification' }));

    expect(messages()).toEqual(['keep']);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('dismissToast from the hook removes the toast and clears its timer', () => {
    const { show, api } = renderProvider();
    show('error', 'Failed to amend trade');
    const [toast] = api().toasts;

    act(() => api().dismissToast(toast!.id));

    expect(screen.queryByText('Failed to amend trade')).not.toBeInTheDocument();
    expect(api().toasts).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores dismissToast for an unknown id', () => {
    const { show, api } = renderProvider();
    show('info', 'still here');

    act(() => api().dismissToast('nope'));

    expect(messages()).toEqual(['still here']);
    expect(vi.getTimerCount()).toBe(1);
  });

  it(`caps the stack at MAX_TOASTS (${MAX_TOASTS}), evicting the oldest and its timer`, () => {
    const { show } = renderProvider();
    for (let i = 1; i <= MAX_TOASTS + 2; i++) show('connection', `toast ${i}`);

    const expected = Array.from({ length: MAX_TOASTS }, (_, i) => `toast ${i + 3}`);
    expect(messages()).toEqual(expected);
    expect(vi.getTimerCount()).toBe(MAX_TOASTS);

    // The surviving toasts keep their own timers: all gone after one duration, none early.
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS - 1));
    expect(messages()).toEqual(expected);
    act(() => vi.advanceTimersByTime(1));
    expect(messages()).toEqual([]);
  });

  it('clears every pending timer on unmount without warnings', () => {
    const consoleError = vi.spyOn(console, 'error');
    const { show, unmount } = renderProvider();
    show('info', 'a');
    show('error', 'b');
    expect(vi.getTimerCount()).toBe(2);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS));
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('keeps showToast and dismissToast stable across toasts', () => {
    const { show, seen } = renderProvider();
    const first = seen[0]!;
    show('info', 'x');
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS));

    expect(seen.length).toBeGreaterThan(1);
    for (const ctx of seen) {
      expect(ctx.showToast).toBe(first.showToast);
      expect(ctx.dismissToast).toBe(first.dismissToast);
    }
  });

  it('keeps the context value identical when the provider re-renders with no toast change', () => {
    const { seen, rerender, Probe } = renderProvider();
    rerender(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );

    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);
  });

  it('does not depend on crypto.randomUUID', () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('crypto.randomUUID is unavailable in an insecure context');
    });
    const { show, api } = renderProvider();
    show('success', 'Trade cancelled');
    show('success', 'Trade cancelled');

    expect(screen.getAllByText('Trade cancelled')).toHaveLength(2);
    const [a, b] = api().toasts;
    expect(a!.id).not.toBe(b!.id);
  });
});
