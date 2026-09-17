// tests/visuals.test.ts
// Visuais gerados (W7): escudos e avatares são determinísticos, estáveis por organização/jogador entre anos, variados
// entre organizações distintas e nunca carregam referência externa (o export do share card não pode depender de rede).
import { describe, expect, it } from 'vitest';
import { avatarFor, avatarKey, avatarParts, avatarSvg, AVATAR_ACCENTS } from '../src/lib/game/visuals/avatar';
import { CREST_PATTERNS, CREST_SHAPES, crestFor, crestInitials, crestKey, crestParts, crestSvg } from '../src/lib/game/visuals/crest';
import { fnv1a, hslToHex, pick } from '../src/lib/game/visuals/hash';
import { countryName, isFlagCode, normalizeFlagCode } from '../src/lib/game/visuals/flags';

const forbidsExternalReferences = (svg: string) => {
  expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/i);
  expect(svg).not.toMatch(/\bx?link:?href=/i);
  expect(svg).not.toMatch(/\bhref=/i);
  expect(svg).not.toMatch(/<script/i);
  expect(svg).not.toMatch(/<image/i);
  expect(svg).not.toMatch(/<foreignObject/i);
  expect(svg).not.toMatch(/url\((?!#)/i);
};

describe('hash determinístico', () => {
  it('fnv1a, pick e hslToHex são puros e estáveis', () => {
    expect(fnv1a('astralis')).toBe(fnv1a('astralis'));
    expect(fnv1a('astralis')).not.toBe(fnv1a('vitality'));
    expect(pick('astralis', 'hue', 12)).toBe(pick('astralis', 'hue', 12));
    expect(pick('astralis', 'hue', 1)).toBe(0);
    expect(hslToHex(0, 100, 50)).toBe('#ff0000');
    expect(hslToHex(120, 100, 50)).toBe('#00ff00');
    expect(hslToHex(240, 100, 50)).toBe('#0000ff');
    expect(hslToHex(0, 0, 100)).toBe('#ffffff');
  });
});

describe('escudos gerados', () => {
  it('a mesma organização em anos diferentes recebe o mesmo escudo', () => {
    const a = crestFor({ name: 'Astralis', id: 'astralis-2016' });
    const b = crestFor({ name: 'Astralis 2018', id: 'astralis-2018' });
    const c = crestFor({ id: 'astralis-2021' });
    expect(a).toEqual(b);
    expect(a.key).toBe('astralis');
    expect(c.key).toBe('astralis');
    expect(crestKey({ name: 'Natus Vincere', id: 'navi-2021' })).toBe('natus-vincere');
    expect(crestKey({ name: 'Virtus.pro' })).toBe('virtus-pro');
  });

  it('um orgId explícito manda na chave, independentemente do nome', () => {
    expect(crestFor({ orgId: 'org-astralis', name: 'Astralis' }).key).toBe('org-astralis');
    expect(crestFor({ orgId: 'org-astralis', name: 'Astralis' })).toEqual(crestFor({ orgId: 'ORG-Astralis ', name: 'Astralis' }));
    expect(crestFor({ orgId: 'org-astralis', name: 'Astralis' }).primary).toBe(crestFor({ orgId: 'org-astralis', name: 'Astralis renamed' }).primary);
  });

  it('é determinístico entre chamadas e organizações distintas recebem descritores distintos', () => {
    const names = ['Astralis', 'Natus Vincere', 'FaZe Clan', 'Team Liquid', 'Vitality', 'Ninjas in Pyjamas', 'G2 Esports', 'Fnatic', 'Cloud9', 'MOUZ', 'Heroic', 'Spirit'];
    const descriptors = names.map((name) => crestFor({ name }));
    expect(descriptors).toEqual(names.map((name) => crestFor({ name })));
    expect(new Set(descriptors.map((crest) => JSON.stringify(crest))).size).toBe(names.length);
    const shapes = new Set(descriptors.map((crest) => crest.shape));
    const patterns = new Set(descriptors.map((crest) => crest.pattern));
    expect(shapes.size).toBeGreaterThan(2);
    expect(patterns.size).toBeGreaterThan(2);
    for (const crest of descriptors) {
      expect(CREST_SHAPES).toContain(crest.shape);
      expect(CREST_PATTERNS).toContain(crest.pattern);
      expect(crest.primary).toMatch(/^#[0-9a-f]{6}$/);
      expect(crest.secondary).toMatch(/^#[0-9a-f]{6}$/);
      expect(crest.primary).not.toBe(crest.secondary);
      expect(crest.initials.length).toBeGreaterThanOrEqual(1);
      expect(crest.initials.length).toBeLessThanOrEqual(3);
    }
  });

  it('iniciais: siglas de nomes compostos, três letras de nome único, letra+número em G2/Cloud9', () => {
    expect(crestInitials('Ninjas in Pyjamas')).toBe('NIP');
    expect(crestInitials('Natus Vincere')).toBe('NV');
    expect(crestInitials('Team Liquid 2019')).toBe('TL');
    expect(crestInitials('Astralis')).toBe('AST');
    expect(crestInitials('G2')).toBe('G2');
    expect(crestInitials('Cloud9')).toBe('C9');
    expect(crestInitials('Virtus.pro')).toBe('VP');
    expect(crestInitials('')).toBe('?');
    expect(crestInitials(null)).toBe('?');
  });

  it('o SVG é autocontido: sem http, href, script, image ou foreignObject', () => {
    for (const name of ['Astralis', 'Natus Vincere', 'G2 Esports', '<b>x</b> & "y"']) {
      const svg = crestSvg(crestFor({ name }), { clipId: 'a b/c', title: name });
      forbidsExternalReferences(svg);
      expect(svg).toContain('<clipPath id="a-b-c">');
      expect(svg).toContain('clip-path="url(#a-b-c)"');
      expect(svg).not.toContain('<b>');
    }
    const parts = crestParts(crestFor({ name: 'Astralis' }));
    expect(parts.viewBox).toBe('0 0 64 64');
    expect(parts.shapePath).toMatch(/^M/);
    expect(parts.fontSize).toBe(19);
    expect(crestParts(crestFor({ name: 'G2' })).fontSize).toBe(25);
  });
});

describe('avatares gerados', () => {
  it('o mesmo jogador em cartas de anos diferentes recebe o mesmo avatar (chave = baseId)', () => {
    const a = avatarFor({ id: 'device-2016', baseId: 'device' });
    const b = avatarFor({ id: 'device-2018', baseId: 'device' });
    expect(a).toEqual(b);
    expect(a.key).toBe('device');
    expect(avatarKey({ id: 'device-2016' })).toBe('device-2016');
    expect(avatarKey('S1mple ')).toBe('s1mple');
    expect(avatarFor('device')).toEqual(a);
  });

  it('é determinístico e jogadores distintos variam', () => {
    const ids = ['device', 's1mple', 'zywoo', 'niko', 'donk', 'coldzera', 'fallen', 'olofmeister', 'get_right', 'f0rest', 'ropz', 'm0nesy'];
    const avatars = ids.map((id) => avatarFor(id));
    expect(avatars).toEqual(ids.map((id) => avatarFor(id)));
    expect(new Set(avatars.map((avatar) => JSON.stringify(avatar))).size).toBeGreaterThanOrEqual(ids.length - 1);
    expect(new Set(avatars.map((avatar) => avatar.background)).size).toBeGreaterThan(3);
    for (const avatar of avatars) {
      expect(AVATAR_ACCENTS).toContain(avatar.accent);
      expect(avatar.background).toMatch(/^#[0-9a-f]{6}$/);
      expect(avatar.figure).toMatch(/^#[0-9a-f]{6}$/);
      expect(avatar.background).not.toBe(avatar.figure);
    }
  });

  it('o SVG é autocontido e só tem geometria (retângulo, silhueta, círculo e acentos)', () => {
    for (const id of ['device', 's1mple', 'zywoo', 'niko', 'donk']) {
      const avatar = avatarFor(id);
      const svg = avatarSvg(avatar);
      forbidsExternalReferences(svg);
      expect(svg).toContain('<circle');
      expect(svg).toContain('<rect');
      const parts = avatarParts(avatar);
      expect(parts.head.cx).toBe(32);
      expect(parts.bodyPath).toMatch(/^M28/);
      expect(parts.accents.length).toBe(avatar.accent === 'none' ? 0 : avatar.accent === 'headset' ? 3 : 1);
    }
  });
});

describe('códigos de bandeira', () => {
  it('aceita ISO alpha-2 minúsculo e subdivisões do flag-icons; normaliza e rejeita o resto', () => {
    expect(isFlagCode('br')).toBe(true);
    expect(isFlagCode('gb-eng')).toBe(true);
    expect(isFlagCode('BR')).toBe(false);
    expect(isFlagCode('bra')).toBe(false);
    expect(isFlagCode('')).toBe(false);
    expect(isFlagCode(null)).toBe(false);
    expect(normalizeFlagCode(' BR ')).toBe('br');
    expect(normalizeFlagCode('Brazil')).toBeNull();
    expect(normalizeFlagCode(undefined)).toBeNull();
  });

  it('nomeia países na língua da interface e as subdivisões pela tabela própria', () => {
    expect(countryName('br', 'pt-BR')).toBe('Brasil');
    expect(countryName('br', 'en')).toBe('Brazil');
    expect(countryName('gb-eng', 'pt-BR')).toBe('Inglaterra');
    expect(countryName('gb-sct', 'en')).toBe('Scotland');
  });
});
