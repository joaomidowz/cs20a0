# Solo Speed and Final Queue Vote Implementation Plan

> **For agentic workers:** Execute inline, one task at a time, with the checks below. Do not dispatch subagents. Steps use checkbox syntax for tracking.

**Goal:** Let players configure solo bot simulation mode and speed, let both human Grand Finalists opt into Normal speed in queue matches, and keep the entry cards readable without clipping across screen sizes.

**Architecture:** Add a distinct `solo` room origin so solo settings are applied by the server before the first round while competitive queue rooms remain automatic at Ultra. Add a server-validated final-speed vote tied to the two human teams in the live Grand Final; only unanimous Normal votes update the shared room speed. Keep the existing visual system and make the entry grid respond to actual card width.

**Tech Stack:** Svelte 5, TypeScript, Zod, Vitest, WebSocket room protocol, CSS Grid, Vite, agent-browser.

## Global Constraints

- Queue matches stay automatic and Ultra until both human Grand Finalists vote for Normal.
- If either Grand Finalist is a bot, no Normal vote is available and the queue match stays Ultra.
- Solo matches remain noncompetitive and use the existing manual round and decision controls.
- Translate new user-facing strings in `pt-BR`, `en`, and `es`.
- Bump the online protocol version when adding the vote command and snapshot state.
- Preserve unrelated working-tree changes, especially the existing user edits in `src/lib/game/online/i18n.ts`.
- Do not change season scoring, bot balance, or the tournament format.

---

### Task 1: Configure solo rooms on the server

**Files:**
- Modify: `src/lib/game/online/contracts.ts`
- Modify: `server/room-manager.ts`
- Modify: `server/http/room-routes.ts`
- Test: `tests/onlineModes.test.ts`
- Test: `tests/onlineServer.test.ts`

**Interfaces:**
- Add `soloStartSchema` and `SoloStartInput` with `field`, `simulationMode`, and `simulationSpeed`.
- Add room origin `solo`; `/solo` creates this origin with the submitted simulation settings.
- Keep the solo room noncompetitive, one-participant-startable, and eligible for its host's existing manual simulation commands.
- Keep `configure-simulation` blocked for `origin === 'queue'`.

- [ ] **Step 1: Add a failing contract test**

```ts
it('accepts solo simulation preferences and preserves old request defaults', () => {
  expect(soloStartSchema.parse({ field: 'random', simulationMode: 'manual', simulationSpeed: 'normal' }))
    .toMatchObject({ field: 'random', simulationMode: 'manual', simulationSpeed: 'normal' });
  expect(soloStartSchema.parse({ field: 'champions' }))
    .toMatchObject({ field: 'champions', simulationMode: 'automatic', simulationSpeed: 'ultra' });
  expect(soloStartSchema.safeParse({ field: 'random', simulationMode: 'automatic', simulationSpeed: 'instant' }).success)
    .toBe(false);
});
```

Run: `npm test -- --run tests/onlineModes.test.ts`

Expected: FAIL because `soloStartSchema` is not exported yet.

- [ ] **Step 2: Add solo configuration to the shared contract and route**

```ts
export const soloStartSchema = z.object({
  field: z.enum(['random', 'champions']).default('random'),
  simulationMode: z.enum(['automatic', 'manual']).default('automatic'),
  simulationSpeed: z.enum(['normal', 'fast', 'ultra']).default('ultra')
}).strict();
export type SoloStartInput = z.input<typeof soloStartSchema>;
```

Use `readBody(request, soloStartSchema)` in `server/http/room-routes.ts` and create the room with `{ ...QUEUE_ROOM_CONFIG, simulationMode: body.simulationMode, simulationSpeed: body.simulationSpeed }` and `{ origin: 'solo', field: body.field }`.

- [ ] **Step 3: Give solo its own room origin and preserve solo invariants**

Update the origin unions in `RoomState` and `RoomSnapshot` to include `'solo'`. Update `createRoom` options, `minParticipants`, `isCompetitiveRun`, and any origin checks so a solo room starts with one prepared participant, never scores season points, and accepts manual configuration; normal queue rooms retain all existing restrictions.

- [ ] **Step 4: Test a manual solo room before its first round**

In `tests/onlineServer.test.ts`, create an origin `solo` room with `simulationMode: 'manual'` and `simulationSpeed: 'normal'`, register a prepared lineup, join with its lineup ticket, and assert the snapshot retains those settings, `competitive` is false, and the first live cursor is `waiting_host` with `nextRoundAt: null`.

Run: `npm test -- --run tests/onlineModes.test.ts tests/onlineServer.test.ts`

Expected: PASS, including existing queue tests that still expect automatic Ultra.

- [ ] **Step 5: Commit the server solo configuration**

```bash
git add src/lib/game/online/contracts.ts server/room-manager.ts server/http/room-routes.ts tests/onlineModes.test.ts tests/onlineServer.test.ts
git commit -m "feat: configure solo bot simulation"
```

### Task 2: Add unanimous Normal voting for human finalists

**Files:**
- Modify: `src/lib/game/online/contracts.ts`
- Modify: `server/room-manager.ts`
- Create: `tests/onlineFinalSpeedVote.test.ts`

**Interfaces:**
- Add the `vote-final-speed` client command.
- Add `RoomSnapshot.finalSpeedVote`, exposing whether the current viewer is an eligible finalist, whether they voted, the number of votes, and whether Normal has been applied.
- Store votes by participant ID in the room. Derive eligibility from the live `final` series and require both teams to belong to human room participants.
- Export `finalHumanIds(phase, teamIds, participantIds)` from `server/room-manager.ts`; it returns a two-ID tuple only for a final series where both teams are room participants, and `null` otherwise.

- [ ] **Step 1: Add failing eligibility and consensus tests**

Create `tests/onlineFinalSpeedVote.test.ts`, import `finalHumanIds` from `server/room-manager.ts`, and cover two human IDs in a `final` series, a bot opponent, and a non-final phase. The manager command test in Step 4 covers a room participant who is not a finalist.

```ts
it('requires exactly the two human finalists before Normal can be enabled', () => {
  expect(finalHumanIds('final', ['p1', 'p2'], new Set(['p1', 'p2']))).toEqual(['p1', 'p2']);
  expect(finalHumanIds('final', ['p1', 'bot-team'], new Set(['p1']))).toBeNull();
  expect(finalHumanIds('semifinal', ['p1', 'p2'], new Set(['p1', 'p2']))).toBeNull();
});
```

Run: `npm test -- --run tests/onlineFinalSpeedVote.test.ts`

Expected: FAIL because the helper and vote state do not exist.

- [ ] **Step 2: Implement server-side finalist validation and voting**

Add a helper that returns the two participant IDs only when the current round phase is `final`, the current final series contains both IDs, and both IDs exist in the room participant map. Reject votes outside that set. On the second valid vote, switch `room.config.simulationSpeed` to `normal` and reschedule unfinished live series with the same interval logic used by `configure-simulation`.

- [ ] **Step 3: Publish vote state and reset it between runs**

Include the viewer's eligibility, vote state, vote count, and applied state in the room snapshot. Bump `version` and `stateVersion` after every accepted vote so the first vote is visible to both finalists and the second vote synchronizes the speed. Clear votes and restore queue speed to `ultra` when a new run begins.

- [ ] **Step 4: Test one vote, unanimous votes, bots, other phases, and non-finalists**

Use a `RoomManager` fixture with three joined participants. Set the internal room's unfinished current round to `{ phase: 'final', complete: false }` and its `live` map to one final runtime whose `state.config.teamA.id` and `teamB.id` are the first two participant IDs. Execute `vote-final-speed` for the first finalist and assert the speed is still `ultra`; execute it for the second finalist and assert the speed is `normal`; assert that the third participant's vote throws `RoomError`. Replace `teamB.id` with `bot-team`, reset speed to `ultra`, and assert the first human vote throws `RoomError` and speed remains `ultra`. Change the current round phase to `semifinal` and assert voting throws there too. Follow the private-room cast pattern in `tests/presence.test.ts`.

Run: `npm test -- --run tests/onlineFinalSpeedVote.test.ts tests/onlineServer.test.ts`

Expected: PASS; queue configuration stays Ultra unless two human finalists vote.

- [ ] **Step 5: Bump the WebSocket protocol and commit**

Set `PROTOCOL_VERSION` to `10` in `src/lib/game/online/contracts.ts` and update tests that assert the current version.

```bash
git add src/lib/game/online/contracts.ts server/room-manager.ts tests/onlineFinalSpeedVote.test.ts tests/onlineServer.test.ts
git commit -m "feat: require both finalists for normal speed"
```

### Task 3: Add solo settings and finalist vote controls to the page

**Files:**
- Modify: `src/lib/game/online/collection.ts`
- Modify: `src/routes/online/+page.svelte`
- Modify: `src/lib/game/online/i18n.ts`
- Test: `tests/onlineModes.test.ts`

**Interfaces:**
- `startSolo(serverUrl, field, preferences)` sends the selected mode and speed to `/solo`.
- The solo card stores local selections initialized to the current defaults `automatic` and `ultra`.
- The final vote button is rendered only from `snapshot.finalSpeedVote.eligible`; the server remains authoritative.

- [ ] **Step 1: Add failing copy and source tests**

Assert that `translateOnline(language, key)` provides nonempty strings in each of `pt-BR`, `en`, and `es` for solo mode, solo speed, the Normal vote, waiting for the other finalist, and the applied state. Keep tests in `tests/onlineModes.test.ts` beside the existing three-language checks.

- [ ] **Step 2: Send solo preferences from the existing card**

Add mode and speed controls above the solo launch buttons. Pass those values through `startSolo`; preserve the Boost path unchanged. Show the current selection in the controls before launch.

- [ ] **Step 3: Render the unanimous-vote control**

Inside the match controls, render a button for eligible finalists. Before a vote, label it to request Normal; after one vote, show the waiting state and `votes/2`; after consensus, show Normal applied. Send `{ type: 'vote-final-speed' }` through the existing `send` function and disable repeat voting once the current player has voted. Use `snapshot.finalSpeedVote` as the display source; do not infer consensus in the browser.

- [ ] **Step 4: Add Portuguese, English, and Spanish strings**

Add all new copy to the corresponding language objects in `src/lib/game/online/i18n.ts`. Keep existing local edits in that file intact and add only the new keys.

- [ ] **Step 5: Verify localization and client type checks**

Run: `npm test -- --run tests/onlineModes.test.ts tests/onlineFinalSpeedVote.test.ts`

Run: `npm run check`

Expected: PASS for all three language maps, command payload types, and Svelte markup.

- [ ] **Step 6: Commit the page controls**

```bash
git add src/lib/game/online/collection.ts src/routes/online/+page.svelte src/lib/game/online/i18n.ts tests/onlineModes.test.ts
git commit -m "feat: expose solo speed and finalist vote controls"
```

### Task 4: Make the entry cards responsive and verify the requested viewports

**Files:**
- Modify: `src/routes/online/+page.svelte`
- Verify: `/online` with the authenticated collection state

- [ ] **Step 1: Use content-aware grid columns**

Replace the fixed three-column breakpoint with a grid that creates columns only when each card has enough room; add `min-width: 0` to card content and ensure controls wrap within their card.

```css
.mode-choice {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
  gap: 14px;
}
.mode-card { min-width: 0; }
```

- [ ] **Step 2: Start the app and inspect the logged-in entry page**

Run: `npm run dev -- --host 127.0.0.1 --port 5173`

Use the existing authenticated browser state if available; otherwise use a local fixture or account flow that renders the solo card. Capture the queue and solo cards at widths `320`, `375`, `390`, `768`, `900`, `1280`, and `1440` px.

- [ ] **Step 3: Check clipping and horizontal overflow**

At each width, verify that headings, descriptive copy, both cards' buttons, mode/speed controls, and vote status remain inside their panels. In the browser console, assert:

```js
document.documentElement.scrollWidth <= window.innerWidth
```

Expected: `true` at every viewport, with no clipped card borders or controls.

- [ ] **Step 4: Build and commit the responsive adjustment**

Run: `npm run build`

```bash
git add src/routes/online/+page.svelte
git commit -m "fix: prevent online entry cards from clipping"
```

## Final Verification

- Run `npm test -- --run tests/onlineModes.test.ts tests/onlineFinalSpeedVote.test.ts tests/onlineServer.test.ts tests/onlineQueue.test.ts`.
- Run `npm run check` and `npm run build`.
- Confirm the production queue remains automatic Ultra until unanimous finalist consent; do not deploy as part of this implementation unless separately requested.
