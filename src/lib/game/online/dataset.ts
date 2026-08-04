import playersJson from '../../data/cs/players.game.json';
import teamsJson from '../../data/cs/teams.game.json';

const hashText = (value: string): string => {
  let first = 2166136261;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 2246822519);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
};

export const ONLINE_DATA_HASH = hashText(JSON.stringify([teamsJson, playersJson]));
