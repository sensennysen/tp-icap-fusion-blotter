import { TradeBlotterPage } from './pages/TradeBlotterPage.js';
import { LoginForm } from './components/LoginForm.js';
import { useAuth } from './hooks/useAuth.js';
import { useToast } from './components/Toast/ToastProvider.js';

export function App() {
  const { user, isLoading, isError, refetch, login, logout } = useAuth();
  const { showToast } = useToast();

  if (isLoading) {
    return <p className="p-6 text-sm text-slate-500">Loading…</p>;
  }

  if (isError) {
    return (
      <p role="alert" className="p-6 text-sm text-sell">
        Couldn&apos;t reach the server.{' '}
        <button type="button" onClick={() => void refetch()} className="font-medium underline">
          Retry
        </button>
      </p>
    );
  }

  if (!user) {
    return (
      <LoginForm
        onSubmit={async (input) => {
          try {
            await login.mutateAsync(input);
          } catch (error) {
            showToast('error', 'Failed to sign in');
            throw error;
          }
        }}
      />
    );
  }

  return (
    <TradeBlotterPage
      user={user}
      onLogout={async () => {
        try {
          await logout.mutateAsync();
        } catch {
          showToast('error', 'Failed to sign out');
        }
      }}
    />
  );
}
