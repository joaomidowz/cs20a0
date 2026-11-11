// tests/careerOwnPhoto.test.ts
// A sua carta só ganha foto quando o nick tem uma registrada com consentimento do retratado (midowz).
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { licensedImageFor, ownPhotoFor } from '../src/lib/game/visuals/licensed';

describe('foto da sua carta', () => {
  it('midowz tem foto própria, com arquivo e consentimento', () => {
    const entry = licensedImageFor('player', 'me:midowz');
    expect(entry?.file).toBe('licensed/players/me-midowz.webp');
    expect(existsSync(`static/${entry!.file}`)).toBe(true);
    expect(entry!.license.type).toBe('consentimento do próprio retratado');
  });

  it('o nick acha a foto sem acento e sem diferença de maiúscula', () => {
    expect(ownPhotoFor('MIDOWZ')?.file).toBe('licensed/players/me-midowz.webp');
    expect(ownPhotoFor('  Midowz ')?.file).toBe('licensed/players/me-midowz.webp');
    expect(ownPhotoFor('tester')).toBeNull();
    for (const nick of ['bodao', 'bodão', 'Bodão', 'BODAO']) expect(ownPhotoFor(nick)?.file).toBe('licensed/players/me-bodao.webp');
    expect(existsSync('static/licensed/players/me-bodao.webp')).toBe(true);
  });

  it('outro nick na sua carta continua sem foto, mesmo se for nick de jogador real', () => {
    expect(licensedImageFor('player', 'me:tester')).toBeNull();
    expect(licensedImageFor('player', 'me:kscerato')).toBeNull();
  });
});
