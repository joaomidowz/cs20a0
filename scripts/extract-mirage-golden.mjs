import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SOURCE_PATH = 'tests/simulator.html';
const IMAGE_PATH = 'static/replay/maps/mirage.webp';
const GRID_MODULE_PATH = 'src/lib/game/replay/golden/mirage-grid.generated.ts';

const EXPECTED_IMAGE_HASH = '6868b21b2dc71ced062df6c9edf8b8249fcd7a0236f0c902bbc136b9c599b380';
const EXPECTED_GRID_HASH = 'c95a9e7cb1d6a18186994075c57afd9193882edb3cb7ce5a79000663ecccaba5';

const source = readFileSync(SOURCE_PATH, 'utf8');

const literal = (name) => {
  const match = source.match(new RegExp(`const ${name}\\s*=\\s*'([^']+)'`));
  if (!match) {
    throw new Error(`${name} not found in ${SOURCE_PATH}`);
  }
  return match[1];
};

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const assertHash = (label, bytes, expected) => {
  const actual = sha256(bytes);
  if (actual !== expected) {
    throw new Error(`${label} hash mismatch: expected ${expected}, got ${actual}`);
  }
};

const imageDataUrl = literal('MAP_IMG');
const separatorIndex = imageDataUrl.indexOf(',');
if (separatorIndex < 0) {
  throw new Error('MAP_IMG is not a data URL');
}

const imageBytes = Buffer.from(imageDataUrl.slice(separatorIndex + 1), 'base64');
const gridBase64 = literal('GRID_B64');
const gridBytes = Buffer.from(gridBase64, 'base64');

assertHash('MAP_IMG', imageBytes, EXPECTED_IMAGE_HASH);
assertHash('GRID_B64', gridBytes, EXPECTED_GRID_HASH);

mkdirSync('static/replay/maps', { recursive: true });
mkdirSync('src/lib/game/replay/golden', { recursive: true });
writeFileSync(IMAGE_PATH, imageBytes);
writeFileSync(
  GRID_MODULE_PATH,
  `// Generated from tests/simulator.html. Do not edit by hand.\nexport const MIRAGE_GRID_B64 = '${gridBase64}' as const;\n`
);
