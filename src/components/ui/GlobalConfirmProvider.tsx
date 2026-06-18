import { useConfirmStore } from '../../store/confirmStore';
import ConfirmDialog from './ConfirmDialog';

export default function GlobalConfirmProvider() {
  const { isOpen, request, closeConfirm } = useConfirmStore();

  if (!request) return null;

  return (
    <ConfirmDialog
      open={isOpen}
      onClose={() => {
        if (request.onCancel) {
          request.onCancel();
        }
        closeConfirm();
      }}
      onConfirm={async (input?: string) => {
        const currentRequest = request;
        await request.onConfirm(input);
        if (useConfirmStore.getState().request === currentRequest) {
          closeConfirm();
        }
      }}
      title={request.title}
      description={request.description}
      confirmLabel={request.confirmLabel ?? 'Konfirmasi'}
      cancelLabel={request.cancelLabel ?? 'Batal'}
      variant={request.variant ?? 'info'}
      requireInput={request.requireInput}
      inputLabel={request.inputLabel}
      inputPlaceholder={request.inputPlaceholder}
    />
  );
}
