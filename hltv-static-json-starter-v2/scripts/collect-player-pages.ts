/**
 * Optional local fetcher for player stat pages generated in data/raw/players.input.json.
 * It saves HTML to data/raw/player-html/. It does not parse stats yet.
 * Do not use this to bypass access controls, captchas, or rate limits.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { readJson, sleep } from './utils.ts';

type PlayerInput = {
  id: string;
  statsUrl: string | null;
};

const players = await readJson<PlayerInput[]>('data/raw/players.input.json');
await fs.mkdir('data/raw/player-html', { recursive: true });

const withUrls = players.filter(player => player.statsUrl);
console.log(`[info] ${withUrls.length}/${players.length} players have statsUrl`);

for (const player of withUrls) {
  const outFile = path.join('data/raw/player-html', `${player.id}.html`);

  try {
    await fs.access(outFile);
    console.log(`[skip] ${player.id} already cached`);
    continue;
  } catch {
    // not cached
  }

  console.log(`[fetch] ${player.id}`);

  try {
    const response = await fetch(player.statsUrl!, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9,pt-BR;q=0.8',
        'user-agent': 'Mozilla/5.0 dataset-preparation-local-script'
      }
    });

    if (!response.ok) {
      console.warn(`[warn] ${player.id}: HTTP ${response.status}. Skipped.`);
      await sleep(4000);
      continue;
    }

    const html = await response.text();
    await fs.writeFile(outFile, html, 'utf-8');
    console.log(`[saved] ${outFile}`);
  } catch (error) {
    console.warn(`[warn] ${player.id}: ${String(error)}. Skipped.`);
  }

  await sleep(4000);
}
