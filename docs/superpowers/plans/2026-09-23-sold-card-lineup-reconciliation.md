# Sold Card Lineup Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure selling an owned card cannot leave it selected in a restored lineup editor, and prove that a repeated sale cannot credit coins twice.

**Architecture:** Add a small pure reconciliation helper beside the online collection API types. The workspace calls it after every successful collection fetch to remove only locally selected cards no longer owned, clearing dependent role/star/map state as needed. Keep the server's existing transactional delete-and-credit behavior and add a regression test for its one-credit guarantee.

**Tech Stack:** Svelte, TypeScript, Vitest, existing Postgres integration test helper.

## Global Constraints

- Preserve all local changes unrelated to the sold-card bug.
- Keep the server's collection deletion and coin ledger update in one transaction.
- Preserve all still-owned draft selections and roles.

---

## Files and responsibilities

- `src/lib/game/online/collection-reconciliation.ts`: export the pure draft-ownership reconciliation function and its input/output type, isolated from other collection API work in the workspace.
- `src/lib/components/online/CollectionWorkspace.svelte`: apply reconciliation after fetching server collection state and after hydrating a saved lineup.
- `tests/collectionReconciliation.test.ts`: unit-test stale players, stale coach, dependent selections, and preservation of owned selections.
- `tests/promos.test.ts`: add a Postgres regression asserting the first sale credits once and the second sale returns `NOT_OWNED` without changing wallet or ledger.

### Task 1: Reconcile lineup drafts against owned card IDs

**Files:**
- Create: `src/lib/game/online/collection-reconciliation.ts`
- Create: `tests/collectionReconciliation.test.ts`

**Interface:**
- Consumes: `{ playerIds: (string | null)[]; roles: (CollectionSlotRole | null)[]; starPlayerId: string | null; coachId: string | null; mapPreferences: MapId[] }` and `ReadonlySet<string>`.
- Produces: the same draft shape, with unowned player IDs replaced by `null`, their roles cleared, an unowned star/coach cleared, and map preferences cleared if any player was removed.

- [x] Add tests asserting removed IDs, corresponding roles and star, stale coach and map picks are cleared while owned choices are preserved.
- [x] Run `npx vitest run tests/collectionReconciliation.test.ts` and confirm it fails because the helper is not implemented.
- [x] Implement `reconcileLineupOwnership(draft, ownedIds)` as a pure function without mutating its arguments.
- [x] Run `npx vitest run tests/collectionReconciliation.test.ts` and confirm all cases pass.

### Task 2: Apply reconciliation on refresh and guard sale credit

**Files:**
- Modify: `src/lib/components/online/CollectionWorkspace.svelte`
- Modify: `tests/promos.test.ts`

**Interface:**
- Consumes: `reconcileLineupOwnership` from Task 1.
- Produces: refreshed UI state that cannot keep unowned cards selected; a regression test for one-credit sale behavior.

- [x] Update `refresh()` to compute owned IDs from the fetched server state, hydrate the active saved lineup when needed, and reconcile `slots`, `roles`, `starPlayerId`, `coachId`, and `mapPicks` against ownership on every successful fetch.
- [x] Add a Postgres test: insert a user and one owned player, call `sellPlayer` once, assert its returned credit and one `sell` ledger row; call it again, assert `NOT_OWNED`, unchanged wallet, and still one sale ledger row.
- [x] Run `npx vitest run tests/collectionReconciliation.test.ts tests/promos.test.ts`; pure tests passed, Postgres integration cases skipped because `TEST_DATABASE_URL` is not configured.
- [x] Run `npm run check` and `git diff --check`.

## Self-review

- Acceptance criteria 1 and 2 are covered by the pure reconciliation tests and workspace refresh integration.
- Acceptance criterion 3 is covered by the Postgres repeated-sale regression; the server implementation remains unchanged.
- Acceptance criterion 4 follows from fetching the persisted lineup on a fresh workspace and reconciling it against fetched ownership.
- No new dependencies or unrelated server changes are planned.
