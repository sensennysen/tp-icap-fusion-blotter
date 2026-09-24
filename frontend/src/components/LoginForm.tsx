import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@fusion-blotter/shared';

interface LoginFormProps {
  onSubmit: (input: LoginInput) => Promise<void>;
}

const inputClass = 'w-full rounded border border-slate-300 px-2 py-1 text-sm';

// Mock auth: there is no password — the name and role are taken on trust.
export function LoginForm({ onSubmit }: LoginFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { role: 'trader' },
  });

  // onSubmit rejects when login fails (the caller has already toasted it);
  // swallow it so the form stays filled in.
  const submit = handleSubmit(async (values) => {
    await onSubmit(values).catch(() => undefined);
  });

  return (
    <main className="mx-auto mt-24 max-w-sm p-6">
      <form
        onSubmit={submit}
        noValidate
        aria-labelledby="login-title"
        className="flex flex-col gap-4 rounded border border-slate-200 bg-white p-6"
      >
        <div>
          <h1 id="login-title" className="text-xl font-semibold text-slate-900">
            Trade Blotter
          </h1>
          <p className="mt-1 text-sm text-slate-500">Mock sign-in — no password needed.</p>
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Username
          <input {...register('username')} autoComplete="username" className={inputClass} />
          {errors.username && (
            <span role="alert" className="text-xs font-normal text-sell">
              {errors.username.message}
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Role
          <select {...register('role')} className={inputClass}>
            <option value="trader">Trader — can create, amend and cancel</option>
            <option value="viewer">Viewer — read-only</option>
          </select>
          {errors.role && (
            <span role="alert" className="text-xs font-normal text-sell">
              {errors.role.message}
            </span>
          )}
        </label>

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
