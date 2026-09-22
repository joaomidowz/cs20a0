import { writable } from 'svelte/store';
import { authFetch } from './account';

/** One `GET /presence` answer: recent activity ("online") plus connected players by room phase. */
export interface PresenceSnapshot {
  online: number;
  playing: number;
  lobby: number;
  final: number;
}

export const presenceView = writable<PresenceSnapshot | null>(null);

/** The two rows the chip shows: "em fila" is everyone waiting (matchmaking queue + room lobbies/drafts, the server's `lobby`), "em jogo" is anyone inside a live room, final round included. */
export const presenceRows = (snapshot: PresenceSnapshot): { queue: number; game: number } => ({ queue: snapshot.lobby, game: snapshot.playing + snapshot.final });

export const clearPresence = () => presenceView.set(null);

type Fetcher = typeof authFetch;

/** Fetches once; errors keep the last counts until the next tick (the chip going dark beats an error state). */
export async function refreshPresence(serverUrl: string, fetcher: Fetcher = authFetch): Promise<void> {
  try {
    presenceView.set(await fetcher<PresenceSnapshot>(serverUrl, '/presence'));
  } catch { /* server offline or restarting: keep what the chip had */ }
}

let timer: ReturnType<typeof setInterval> | null = null;
let startedFor = '';

/** Slow poll behind the "online" chip (30s, paused in hidden tabs). The request is authenticated, so watching the chip keeps you counted. */
export function startPresencePolling(serverUrl: string, intervalMs = 30_000, fetcher: Fetcher = authFetch): void {
  if (startedFor === serverUrl && timer) return;
  stopPresencePolling();
  startedFor = serverUrl;
  void refreshPresence(serverUrl, fetcher);
  timer = setInterval(() => { if (typeof document === 'undefined' || !document.hidden) void refreshPresence(serverUrl, fetcher); }, intervalMs);
  if (typeof window !== 'undefined') window.addEventListener('pagehide', stopPresencePolling);
}

export function stopPresencePolling(): void {
  if (timer) clearInterval(timer);
  timer = null;
  startedFor = '';
}
