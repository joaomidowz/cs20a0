import type { LineupSlotRole, Player, SelectedPlayer } from './types';

export const ROLE_LIMITS: Record<LineupSlotRole, number> = {
  awper: 1,
  igl: 1,
  entry: 1,
  lurker: 1,
  rifler: 3,
  support: 1
};

export const PICK_REASONS = {
  duplicate: 'Este jogador já foi escolhido em outra era.',
  awper: 'Sua line já tem um AWPer principal.',
  igl: 'Sua line já tem um IGL.',
  entry: 'Sua line já tem um entry/opener.',
  lurker: 'Sua line já tem um lurker/closer.',
  rifler: 'Limite de rifles atingido.',
  support: 'Sua line já tem um support principal.',
  invalid: 'Escolha uma função válida para este jogador.'
} as const;

const KNOWN_ROLE_FALLBACKS: Record<string, LineupSlotRole[]> = {
  fallen: ['awper', 'igl'],
  cadian: ['awper', 'igl'],
  jame: ['awper', 'igl'],
  gla1ve: ['igl'],
  karrigan: ['igl'],
  apex: ['igl'],
  boombl4: ['igl'],
  aleksib: ['igl'],
  hooxi: ['igl'],
  kyxsan: ['igl'],
  chopper: ['igl'],
  siuhy: ['igl'],
  nafany: ['igl'],
  m0nesy: ['awper'],
  s1mple: ['awper', 'rifler'],
  zywoo: ['awper', 'rifler'],
  device: ['awper'],
  sh1ro: ['awper'],
  broky: ['awper'],
  w0nderful: ['awper'],
  torzsi: ['awper'],
  donk: ['entry'],
  fer: ['entry'],
  yekindar: ['entry'],
  rain: ['entry', 'rifler'],
  ropz: ['lurker'],
  coldzera: ['lurker', 'rifler'],
  xyp9x: ['lurker', 'support'],
  perfecto: ['support'],
  taco: ['support'],
  interz: ['support'],
  sjuush: ['support'],
  jks: ['support', 'rifler'],
  naf: ['lurker', 'rifler']
};

const normalize = (value: string | null | undefined) =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();

export function getPlayerBaseId(player: Player): string {
  const identity = player.baseId?.trim() || player.id;
  return normalize(identity.replace(/[-_\s]?(?:19|20)\d{2}$/i, ''));
}

export function getEligibleSlotRoles(player: Player): LineupSlotRole[] {
  const baseId = normalize(getPlayerBaseId(player));
  const nickname = normalize(player.nickname);
  const known = KNOWN_ROLE_FALLBACKS[baseId] ?? KNOWN_ROLE_FALLBACKS[nickname];
  if (known) return [...known];

  const source = [player.role, player.title, ...(player.traits ?? [])].map(normalize).join(' ');
  const roles: LineupSlotRole[] = [];
  const add = (role: LineupSlotRole) => {
    if (!roles.includes(role)) roles.push(role);
  };

  if (/awp|sniper/.test(source)) add('awper');
  if (/igl|captain|capitao|leader/.test(source) || (player.igl ?? 0) >= 80) add('igl');
  if (/entry|opener|spacecreator|aggression/.test(source)) add('entry');
  if (/lurk|closer|clutchminister/.test(source)) add('lurker');
  if (/support|anchor/.test(source) || (player.support ?? 0) >= 93) add('support');
  if (/rifler|riflegod|hybrid/.test(source)) add('rifler');

  if (!roles.length) add('rifler');
  return roles;
}

const countRole = (selectedPlayers: SelectedPlayer[], role: LineupSlotRole) =>
  selectedPlayers.filter((selected) => selected.selectedSlotRole === role).length;

const reasonForRole = (role: LineupSlotRole) => PICK_REASONS[role];

export function validatePlayerPick(
  player: Player,
  selectedPlayers: SelectedPlayer[],
  desiredSlotRole?: LineupSlotRole,
  playerLookup?: (id: string) => Player | undefined
): { ok: boolean; reason?: string; validRoles: LineupSlotRole[] } {
  const baseId = getPlayerBaseId(player);
  const duplicate = selectedPlayers.some((selected) => {
    const selectedPlayer = playerLookup?.(selected.playerId);
    return selectedPlayer ? getPlayerBaseId(selectedPlayer) === baseId : selected.playerId.replace(/-\d{4}$/, '').toLowerCase() === baseId;
  });
  if (duplicate) return { ok: false, reason: PICK_REASONS.duplicate, validRoles: [] };

  const eligibleRoles = getEligibleSlotRoles(player);
  const validRoles = eligibleRoles.filter((role) => countRole(selectedPlayers, role) < ROLE_LIMITS[role]);

  if (desiredSlotRole) {
    if (!eligibleRoles.includes(desiredSlotRole)) {
      return { ok: false, reason: PICK_REASONS.invalid, validRoles };
    }
    if (!validRoles.includes(desiredSlotRole)) {
      return { ok: false, reason: reasonForRole(desiredSlotRole), validRoles };
    }
    return { ok: true, validRoles };
  }

  if (!validRoles.length) {
    const blockedRole = eligibleRoles.find((role) => countRole(selectedPlayers, role) >= ROLE_LIMITS[role]);
    return { ok: false, reason: blockedRole ? reasonForRole(blockedRole) : PICK_REASONS.invalid, validRoles: [] };
  }

  return { ok: true, validRoles };
}

export function getLineupRoleCounts(selectedPlayers: SelectedPlayer[]) {
  return (Object.keys(ROLE_LIMITS) as LineupSlotRole[]).reduce(
    (counts, role) => ({ ...counts, [role]: countRole(selectedPlayers, role) }),
    {} as Record<LineupSlotRole, number>
  );
}

export function getRoleLabel(role: LineupSlotRole): string {
  return role === 'awper' ? 'AWPer' : role === 'igl' ? 'IGL' : role.charAt(0).toUpperCase() + role.slice(1);
}
