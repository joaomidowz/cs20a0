// tests/playerCareerMembers.test.ts
// Jogadores criados na sua carreira (reserva promovido, substituto de quem saiu a seu pedido) são membros do time:
// ficam ao recarregar a página, ao trocar de função, na virada da temporada e no time quando você sai. A sessão e o
// recarregamento mostram o mesmo elenco.
import { describe, expect, it } from 'vitest';
import { seatToTake } from '../src/lib/game/playerCareer/engine';
import { sceneOrgById } from '../src/lib/game/playerCareer/data';
import { registerSeats, rosterIn, seatMovesOf, worldRosters } from '../src/lib/game/playerCareer/world';

const PAIN = 'pain-2026';

describe('cache das vagas', () => {
  it('vaga nova na mesma sessão aparece no mundo como depois de recarregar', () => {
    const seed = 'members-cache-1';
    const vitality = sceneOrgById.get('vitality-2026')!;
    const first = [{ ...seatToTake(sceneOrgById.get(PAIN)!, 'awper'), season: 1 }];
    registerSeats(seed, first);
    expect(seatMovesOf(seed)).toHaveLength(1);
    worldRosters(seed, 1);
    registerSeats(seed, [...first, { ...seatToTake(vitality, 'awper'), season: 1 }]);
    const move = seatMovesOf(seed).find((entry) => entry.fromId === vitality.id);
    expect(move).toBeDefined();
    expect(rosterIn(seed, 1, move!.toId).map((member) => member.nick.toLowerCase())).toContain(move!.nick.toLowerCase());
    expect(rosterIn(seed, 1, vitality.id).map((member) => member.nick.toLowerCase())).toContain(move!.standIn.toLowerCase());
  });
});
