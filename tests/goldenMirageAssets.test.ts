import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MIRAGE_GRID_B64 } from '../src/lib/game/replay/golden/mirage-grid.generated';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

describe('Mirage golden assets', () => {
  it('preserves the exact embedded radar bytes', () => {
    const image = readFileSync(new URL('../static/replay/maps/mirage.webp', import.meta.url));
    expect(image.byteLength).toBe(21_224);
    expect(sha256(image)).toBe('6868b21b2dc71ced062df6c9edf8b8249fcd7a0236f0c902bbc136b9c599b380');
  });

  it('preserves the exact embedded collision grid', () => {
    const grid = Buffer.from(MIRAGE_GRID_B64, 'base64');
    expect(grid.byteLength).toBe(4_608);
    expect(sha256(grid)).toBe('c95a9e7cb1d6a18186994075c57afd9193882edb3cb7ce5a79000663ecccaba5');
  });
});
