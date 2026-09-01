import type { GoldenPoint } from './types';
import { createMirageNavigation } from './navigation';

export interface MirageTacticalPoint extends GoldenPoint {
  n: string;
}

export type MirageCtPostRole =
  | 'A_ANCHOR'
  | 'A_SUPPORT'
  | 'MID_WINDOW'
  | 'MID_FLEX'
  | 'B_ANCHOR'
  | 'B_RETAKE';

export interface MirageNavigationPost {
  p: GoldenPoint;
  n: string;
  role: MirageCtPostRole;
}

export const MIRAGE_POINTS = {
  ctSpawn: { x: 279.4, y: 272.4 },
  tSpawn: { x: 677, y: 960.2 },
  mid: { x: 560, y: 650 },
  siteA: { x: 768.5, y: 193.6 },
  siteB: { x: 200.2, y: 563.1 }
} as const satisfies Record<string, GoldenPoint>;

export const SITE_RECT = {
  A: [723.9, 151.9, 813, 235.4],
  B: [167.9, 521.4, 232.6, 604.8]
} as const;

export const SITE_PAD = 46;

export const SITE_CENTER = {
  A: { x: 768.5, y: 193.6 },
  B: { x: 200.2, y: 563.1 }
} as const satisfies Record<'A' | 'B', GoldenPoint>;

export const CT_SPAWN_PT = { x: 279.4, y: 272.4 } as const satisfies GoldenPoint;
export const T_SPAWN_PT = { x: 677, y: 960.2 } as const satisfies GoldenPoint;
export const MID_PT = { x: 560, y: 650 } as const satisfies GoldenPoint;

export const SPAWN_CT = [
  { x: 285.3, y: 306.7 },
  { x: 242.7, y: 253.3 },
  { x: 306.7, y: 296 },
  { x: 248, y: 328 },
  { x: 328, y: 285.3 }
] as const satisfies readonly GoldenPoint[];

export const SPAWN_T = [
  { x: 669.3, y: 941.3 },
  { x: 722.7, y: 989.3 },
  { x: 690.7, y: 930.7 },
  { x: 621.3, y: 968 },
  { x: 642.7, y: 957.3 }
] as const satisfies readonly GoldenPoint[];

export const PLANT_SPOTS = {
  A: [
    { x: 770.7, y: 194.7 },
    { x: 738.7, y: 162.7 },
    { x: 733.3, y: 221.3 }
  ],
  B: [
    { x: 200, y: 562.7 },
    { x: 232, y: 594.7 },
    { x: 168, y: 594.7 }
  ]
} as const satisfies Record<'A' | 'B', readonly GoldenPoint[]>;

const tacticalPoint = (x: number, y: number, n: string): MirageTacticalPoint => ({ x, y, n });
const dataNavigation = createMirageNavigation();
const navPost = (
  x: number,
  y: number,
  n: string,
  role: MirageCtPostRole
): MirageNavigationPost => ({ p: dataNavigation.nearestFree(x, y), n, role });

export const UTIL_POINT = {
  WINDOW: tacticalPoint(530, 455, 'JANELÃO'),
  CONNECTOR: tacticalPoint(601, 388, 'CONNECTOR'),
  JUNGLE: tacticalPoint(661, 300, 'PASSAGEM JUNGLE'),
  STAIRS: tacticalPoint(696, 307, 'STAIRS · CABEÇINHA'),
  TICKET: tacticalPoint(670, 220, 'CT · TICKET'),
  SHORT: tacticalPoint(431, 540, 'SHORT · L'),
  MARKET_WINDOW: tacticalPoint(285, 540, 'JANELA MARKET'),
  MARKET_DOOR: tacticalPoint(315, 585, 'PORTA MARKET'),
  VAN: tacticalPoint(240, 650, 'VAN'),
  BENCH: tacticalPoint(245, 585, 'BANCO'),
  CT_TOP_MID: tacticalPoint(560, 650, 'TOP MID · DOMÍNIO CT'),
  CT_UNDERPASS: tacticalPoint(502, 720, 'UNDERPASS · DOMÍNIO CT'),
  CT_CAVE_B: tacticalPoint(178, 735, 'CAVERNA B · BATIDA CT'),
  CT_RAMP_A: tacticalPoint(872, 365, 'RAMP A · BATIDA CT')
} as const;

export const CT_POST = {
  A_TICKET: navPost(670, 220, 'TICKET', 'A_ANCHOR'),
  A_JUNGLE: navPost(661, 300, 'JUNGLE', 'A_SUPPORT'),
  A_STAIRS: navPost(696, 307, 'STAIRS', 'A_SUPPORT'),
  M_WINDOW: navPost(530, 455, 'JANELÃO', 'MID_WINDOW'),
  M_CONNECTOR: navPost(601, 388, 'CONNECTOR', 'MID_FLEX'),
  M_SHORT: navPost(431, 540, 'SHORT / L', 'MID_FLEX'),
  B_VAN: navPost(240, 650, 'VAN', 'B_ANCHOR'),
  B_MARKET: navPost(285, 540, 'MARKET', 'B_RETAKE'),
  B_BENCH: navPost(245, 585, 'BANCO', 'B_RETAKE')
} as const;

export const CT_HOLD = {
  A: [CT_POST.A_TICKET, CT_POST.A_JUNGLE, CT_POST.A_STAIRS],
  B: [CT_POST.B_VAN, CT_POST.B_MARKET, CT_POST.B_BENCH],
  M: [CT_POST.M_WINDOW, CT_POST.M_CONNECTOR, CT_POST.M_SHORT]
} as const;

export const CT_ROTATE = {
  A: [CT_POST.A_JUNGLE, CT_POST.M_CONNECTOR, CT_POST.A_STAIRS],
  B: [CT_POST.B_MARKET, CT_POST.M_SHORT, CT_POST.B_BENCH]
} as const;

export const T_STAGE = {
  A: [
    tacticalPoint(893, 680, 'A RAMP'),
    tacticalPoint(820, 545, 'PALÁCIO'),
    tacticalPoint(560, 650, 'TOP MID')
  ],
  B: [
    tacticalPoint(178, 735, 'APPS B'),
    tacticalPoint(560, 650, 'TOP MID'),
    tacticalPoint(502, 720, 'UNDERPASS')
  ]
} as const;

export const T_CHOKE = {
  A: [
    tacticalPoint(872, 365, 'SAÍDA A RAMP'),
    tacticalPoint(739, 381, 'SAÍDA PALÁCIO'),
    UTIL_POINT.CONNECTOR
  ],
  B: [tacticalPoint(220, 645, 'SAÍDA APPS'), UTIL_POINT.SHORT, UTIL_POINT.SHORT]
} as const;

export const T_MID_STAGE = [
  tacticalPoint(560, 650, 'TOP MID'),
  tacticalPoint(502, 720, 'UNDERPASS'),
  tacticalPoint(400, 645, 'CAT')
] as const;

export const PLAYBOOK = {
  A: {
    smokes: [UTIL_POINT.JUNGLE, UTIL_POINT.STAIRS, UTIL_POINT.TICKET],
    molys: [UTIL_POINT.STAIRS],
    flashes: [tacticalPoint(760, 265, 'FLASH A'), tacticalPoint(720, 335, 'FLASH POR CIMA A')]
  },
  B: {
    smokes: [UTIL_POINT.MARKET_WINDOW, UTIL_POINT.MARKET_DOOR, UTIL_POINT.SHORT],
    molys: [UTIL_POINT.VAN],
    flashes: [tacticalPoint(250, 620, 'FLASH B'), tacticalPoint(265, 540, 'FLASH MARKET')]
  },
  M: {
    smokes: [UTIL_POINT.WINDOW],
    molys: [],
    flashes: [tacticalPoint(520, 570, 'FLASH TOP MID')]
  }
} as const;

export const CT_RETAKE_UTIL = {
  A: {
    flashes: PLANT_SPOTS.A.slice(0, 2),
    molys: PLANT_SPOTS.A.slice(0, 1)
  },
  B: {
    flashes: PLANT_SPOTS.B.slice(0, 2),
    molys: PLANT_SPOTS.B.slice(0, 1)
  }
} as const;
