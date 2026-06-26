import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

export async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

export async function readJsonIfExists<T>(filePath: string, fallback: T): Promise<T> {
  if (!fsSync.existsSync(filePath)) return fallback;
  return readJson<T>(filePath);
}

export async function writeJson(filePath: string, data: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

export function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/0/g, '0')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function canonicalNick(value: string) {
  return slugify(value).replace(/-/g, '');
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function round(value: number) {
  return Math.round(clamp(value));
}

export function normalize(value: number, min: number, max: number) {
  return clamp(((value - min) / (max - min)) * 100);
}

export function buildStatsUrl(input: {
  hltvPlayerId: number;
  nickname: string;
  startDate: string;
  endDate: string;
  csVersion?: 'CSGO' | 'CS2' | null;
}) {
  const params = new URLSearchParams();
  if (input.csVersion) params.set('csVersion', input.csVersion);
  params.set('startDate', input.startDate);
  params.set('endDate', input.endDate);
  return `https://www.hltv.org/stats/players/${input.hltvPlayerId}/${encodeURIComponent(input.nickname)}?${params.toString()}`;
}
