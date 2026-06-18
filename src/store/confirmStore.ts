import { create } from 'zustand';

type ConfirmVariant = 'danger' | 'warning' | 'info';

export interface ConfirmRequest {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  requireInput?: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
  onConfirm: (input?: string) => void | Promise<void>;
  onCancel?: () => void;
}

interface ConfirmState {
  isOpen: boolean;
  request: ConfirmRequest | null;
  requestConfirm: (req: ConfirmRequest) => void;
  closeConfirm: () => void;
}

export const useConfirmStore = create<ConfirmState>((set) => ({
  isOpen: false,
  request: null,
  requestConfirm: (req) => set({ isOpen: true, request: req }),
  closeConfirm: () => set({ isOpen: false }),
}));
