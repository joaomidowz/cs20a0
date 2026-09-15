import { describe, expect, it } from 'vitest';
import eventsJson from '../src/lib/data/cs/circuit-events.game.json';

type CircuitEvent = {
	id: string;
	year: number;
	name: string;
	organizer: string;
	tier: string;
	teams: number;
	format?: string;
	prizePool?: number;
	location: string;
	liquipediaUrl: string;
	needsReview?: boolean;
};

const events = eventsJson as CircuitEvent[];

describe('circuit-events.game.json', () => {
	it('tem exatamente 5 eventos por ano de 2016 a 2026', () => {
		for (let year = 2016; year <= 2026; year++) {
			expect(events.filter((e) => e.year === year), `ano ${year}`).toHaveLength(5);
		}
		expect(events).toHaveLength(55);
	});

	it('tem ids únicos', () => {
		expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
	});

	it('usa tier elite ou open', () => {
		for (const e of events) expect(['elite', 'open']).toContain(e.tier);
	});

	it('tem prizePool inteiro >= 0 quando presente', () => {
		for (const e of events) {
			if (e.prizePool === undefined) continue;
			expect(Number.isInteger(e.prizePool)).toBe(true);
			expect(e.prizePool).toBeGreaterThanOrEqual(0);
		}
	});

	it('aponta para a Liquipedia de Counter-Strike', () => {
		for (const e of events) {
			expect(e.liquipediaUrl.startsWith('https://liquipedia.net/counterstrike/')).toBe(true);
		}
	});

	it('não inclui Majors', () => {
		for (const e of events) expect(e.name).not.toMatch(/Major/);
	});
});
