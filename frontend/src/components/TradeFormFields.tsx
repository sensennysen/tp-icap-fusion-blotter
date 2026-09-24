import type { ReactNode } from 'react';
import type {
  FieldErrors,
  FieldValues,
  Path,
  UseFormRegister,
  UseFormSetError,
} from 'react-hook-form';
import type { CreateTradeInput } from '@fusion-blotter/shared';
import { ApiError } from '../lib/apiClient.js';

interface TradeFormFieldsProps<T extends FieldValues> {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
}

function fieldError<T extends FieldValues>(errors: FieldErrors<T>, name: keyof CreateTradeInput) {
  return errors[name as Path<T>]?.message as string | undefined;
}

export function TradeFormFields<T extends Partial<CreateTradeInput>>({
  register,
  errors,
}: TradeFormFieldsProps<T>) {
  const registerField = register as unknown as UseFormRegister<CreateTradeInput>;
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Symbol" error={fieldError(errors, 'symbol')}>
        <input {...registerField('symbol')} className={inputClass} />
      </Field>

      <Field label="Side" error={fieldError(errors, 'side')}>
        <select {...registerField('side')} className={inputClass}>
          <option value="BUY">Buy</option>
          <option value="SELL">Sell</option>
        </select>
      </Field>

      <Field label="Quantity" error={fieldError(errors, 'quantity')}>
        <input
          type="number"
          {...registerField('quantity', { valueAsNumber: true })}
          className={inputClass}
        />
      </Field>

      <Field label="Price" error={fieldError(errors, 'price')}>
        <input
          type="number"
          step="0.0001"
          {...registerField('price', { valueAsNumber: true })}
          className={inputClass}
        />
      </Field>

      <Field label="Trader" error={fieldError(errors, 'trader')}>
        <input {...registerField('trader')} className={inputClass} />
      </Field>

      <Field label="Book" error={fieldError(errors, 'book')}>
        <input {...registerField('book')} className={inputClass} />
      </Field>

      <Field label="Counterparty" error={fieldError(errors, 'counterparty')}>
        <input {...registerField('counterparty')} className={inputClass} />
      </Field>
    </div>
  );
}

const tradeFields = [
  'symbol',
  'side',
  'quantity',
  'price',
  'trader',
  'book',
  'counterparty',
] as const satisfies readonly (keyof CreateTradeInput)[];

/**
 * Shows a server VALIDATION_ERROR's per-field messages under the matching
 * inputs. Keys the form doesn't render (e.g. `_`) are ignored — the caller's
 * toast already reports the failure as a whole.
 */
export function setServerFieldErrors<T extends Partial<CreateTradeInput>>(
  error: unknown,
  setError: UseFormSetError<T>,
) {
  if (!(error instanceof ApiError) || !error.fields) return;
  const setFieldError = setError as unknown as UseFormSetError<CreateTradeInput>;
  for (const field of tradeFields) {
    const message = error.fields[field];
    if (message) setFieldError(field, { type: 'server', message });
  }
}

const inputClass = 'w-full rounded border border-slate-300 px-2 py-1 text-sm';

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
      {label}
      {children}
      {error && (
        <span role="alert" className="text-xs font-normal text-sell">
          {error}
        </span>
      )}
    </label>
  );
}
