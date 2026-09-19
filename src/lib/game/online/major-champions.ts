/**
 * Campeões de Major de CS:GO e CS2, na versão do ano do título, para o solo "Major dos Campeões".
 * Lista curada à mão: o dataset não marca campeões. `teamId` é o id em `teams.game.json`; `null` quando aquele
 * time-ano não existe no dataset do online (hoje 2013–2015) e por isso fica fora do sorteio.
 * `tests/majorChampions.test.ts` confere os ids contra o dataset e lista os que faltam.
 */
export interface MajorChampion {
  event: string;
  year: number;
  teamId: string | null;
}

export const MAJOR_CHAMPIONS: readonly MajorChampion[] = [
  { event: 'DreamHack Winter 2013', year: 2013, teamId: null }, // fnatic
  { event: 'EMS One Katowice 2014', year: 2014, teamId: null }, // Virtus.pro
  { event: 'ESL One Cologne 2014', year: 2014, teamId: null }, // Ninjas in Pyjamas
  { event: 'DreamHack Winter 2014', year: 2014, teamId: null }, // fnatic
  { event: 'ESL One Katowice 2015', year: 2015, teamId: null }, // fnatic
  { event: 'ESL One Cologne 2015', year: 2015, teamId: null }, // fnatic
  { event: 'DreamHack Open Cluj-Napoca 2015', year: 2015, teamId: null }, // EnVyUs
  { event: 'MLG Columbus 2016', year: 2016, teamId: 'luminosity-2016' },
  { event: 'ESL One Cologne 2016', year: 2016, teamId: 'sk-2016' },
  { event: 'ELEAGUE Major Atlanta 2017', year: 2017, teamId: 'astralis-2017' },
  { event: 'PGL Major Kraków 2017', year: 2017, teamId: 'gambit-2017' },
  { event: 'ELEAGUE Major Boston 2018', year: 2018, teamId: 'cloud9-2018' },
  { event: 'FACEIT Major London 2018', year: 2018, teamId: 'astralis-2018' },
  { event: 'IEM Katowice Major 2019', year: 2019, teamId: 'astralis-2019' },
  { event: 'StarLadder Major Berlin 2019', year: 2019, teamId: 'astralis-2019' },
  { event: 'PGL Major Stockholm 2021', year: 2021, teamId: 'natus-vincere-2021' },
  { event: 'PGL Major Antwerp 2022', year: 2022, teamId: 'faze-2022' },
  { event: 'IEM Rio Major 2022', year: 2022, teamId: 'outsiders-2022' },
  { event: 'BLAST.tv Paris Major 2023', year: 2023, teamId: 'vitality-2023' },
  { event: 'PGL Major Copenhagen 2024', year: 2024, teamId: 'natus-vincere-2024' },
  { event: 'Perfect World Shanghai Major 2024', year: 2024, teamId: 'spirit-2024' },
  { event: 'BLAST.tv Austin Major 2025', year: 2025, teamId: 'vitality-2025' },
  { event: 'StarLadder Budapest Major 2025', year: 2025, teamId: 'vitality-2025' },
  { event: 'IEM Cologne Major 2026', year: 2026, teamId: 'falcons-2026' }
];

/** Ids distintos que entram no campo (um time campeão duas vezes no mesmo ano aparece uma vez só). */
export const CHAMPION_TEAM_IDS: ReadonlySet<string> = new Set(MAJOR_CHAMPIONS.flatMap((champion) => (champion.teamId ? [champion.teamId] : [])));
