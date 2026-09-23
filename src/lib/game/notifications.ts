import { writable } from 'svelte/store';

export type ToastKind = 'success' | 'info' | 'warning' | 'error';

export interface ToastNotice {
  id: number;
  message: string;
  kind: ToastKind;
}

export interface ToastInput {
  message: string;
  kind?: ToastKind;
  duration?: number;
  key?: string;
}

const MAX_TOASTS = 3;
let nextId = 0;
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const keys = new Map<string, number>();

export const toastNotices = writable<ToastNotice[]>([]);

function removeToast(id: number) {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  for (const [key, keyedId] of keys) if (keyedId === id) keys.delete(key);
  toastNotices.update((notices) => notices.filter((notice) => notice.id !== id));
}

/** Add a toast to the app-wide notification stack. A key updates an existing toast instead of repeating it. */
export function showToast(input: string | ToastInput, kind: ToastKind = 'success', duration = 3_600) {
  const notice = typeof input === 'string' ? { message: input, kind, duration, key: undefined } : {
    message: input.message,
    kind: input.kind ?? 'success',
    duration: input.duration ?? (input.kind === 'error' ? 6_000 : 3_600),
    key: input.key
  };

  if (!notice.message.trim()) return;
  const existingId = notice.key ? keys.get(notice.key) : undefined;
  if (existingId !== undefined) {
    toastNotices.update((notices) => notices.map((item) => item.id === existingId ? { ...item, message: notice.message, kind: notice.kind } : item));
    const previousTimer = timers.get(existingId);
    if (previousTimer) clearTimeout(previousTimer);
    timers.set(existingId, setTimeout(() => removeToast(existingId), notice.duration));
    return existingId;
  }

  const id = ++nextId;
  let removed: number | undefined;
  toastNotices.update((notices) => {
    const next = [...notices, { id, message: notice.message, kind: notice.kind }];
    if (next.length > MAX_TOASTS) removed = next.shift()?.id;
    return next;
  });
  if (removed !== undefined) removeToast(removed);
  if (notice.key) keys.set(notice.key, id);
  timers.set(id, setTimeout(() => removeToast(id), notice.duration));
  return id;
}

export function dismissToast(id: number) {
  removeToast(id);
}
