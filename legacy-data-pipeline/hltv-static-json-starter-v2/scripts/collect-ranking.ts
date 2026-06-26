/**
 * Optional local fetcher.
 * Downloads configured ranking snapshot pages to data/raw/html/.
 * If HLTV returns 403/captcha/Cloudflare, this script skips and build:data uses teams.seed.json.
 * Do not use this to bypass access controls.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { readJson, sleep } from './utils.ts';

type YearInput = {
  year: number;
  rankingUrl: string;
};

const years = await readJson<YearInput[]>('data/input/years.input.json');
await fs.mkdir('data/raw/html', { recursive: true });

for (const item of years) {
  const outFile = path.join('data/raw/html', `${item.year}-ranking.html`);

  try {
    await fs.access(outFile);
    console.log(`[skip] ${item.year} already cached at ${outFile}`);
    continue;
  } catch {
    // not cached
  }

  console.log(`[fetch] ${item.year}: ${item.rankingUrl}`);

  try {
    const response = await fetch(item.rankingUrl, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9,pt-BR;q=0.8',
        'user-agent': 'Mozilla/5.0 dataset-preparation-local-script'
      }
    });

    if (!response.ok) {
      console.warn(`[warn] ${item.year}: HTTP ${response.status}. Using seed fallback later.`);
      await sleep(5000);
      continue;
    }

    const html = await response.text();
    await fs.writeFile(outFile, html, 'utf-8');
    console.log(`[saved] ${outFile}`);
  } catch (error) {
    console.warn(`[warn] ${item.year}: ${String(error)}. Using seed fallback later.`);
  }

  await sleep(5000);
}
