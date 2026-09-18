import { writable } from 'svelte/store';

/** One app-wide confirmation dialog in place of `window.confirm`: styled, translated, keyboard friendly. */
export interface DialogRequest {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: 'default' | 'danger';
}

interface OpenDialog extends DialogRequest {
  resolve: (confirmed: boolean) => void;
}

export const activeDialog = writable<OpenDialog | null>(null);

export function confirmDialog(request: DialogRequest): Promise<boolean> {
  return new Promise((resolve) => {
    activeDialog.update((current) => {
      current?.resolve(false);
      return { ...request, resolve };
    });
  });
}

export function settleDialog(confirmed: boolean) {
  activeDialog.update((current) => {
    current?.resolve(confirmed);
    return null;
  });
}
