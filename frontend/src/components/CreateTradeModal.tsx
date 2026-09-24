import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createTradeSchema, type CreateTradeInput } from '@fusion-blotter/shared';
import { Modal } from './Modal.js';
import { TradeFormFields, setServerFieldErrors } from './TradeFormFields.js';

interface CreateTradeModalProps {
  onClose: () => void;
  onSubmit: (input: CreateTradeInput) => Promise<void>;
}

export function CreateTradeModal({ onClose, onSubmit }: CreateTradeModalProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateTradeInput>({
    resolver: zodResolver(createTradeSchema),
    defaultValues: { side: 'BUY' },
  });

  // onSubmit rejects when the mutation fails (the caller has already toasted
  // it): stay open so the user's input survives, and surface any server
  // field errors next to their inputs. Close only after a successful submit.
  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values);
    } catch (error) {
      setServerFieldErrors(error, setError);
      return;
    }
    onClose();
  });

  return (
    <Modal title="New Trade" onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TradeFormFields register={register} errors={errors} />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Create Trade
          </button>
        </div>
      </form>
    </Modal>
  );
}
