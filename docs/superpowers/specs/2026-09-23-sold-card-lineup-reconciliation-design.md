# Reconcile sold cards with the lineup editor

## Problem

After a card is sold, the collection refreshes from the server but `CollectionWorkspace` only hydrates lineup slots when its local slots are empty. A restored page or retained draft can therefore keep showing a card that is no longer owned. Separately, repeated sell requests must never pay twice.

## Design

Treat the server collection as the source of truth for ownership. Whenever collection state is refreshed, reconcile the current editor draft against the newly fetched owned-card IDs: remove only players/coaches no longer owned, clear player roles and star selection that refer to removed players, and clear map preferences if the edited five is no longer intact. Preserve all still-owned draft choices. The existing server transaction remains responsible for deleting the owned card and crediting coins atomically; add regression coverage proving a second sale request cannot credit again.

## Scope and validation

Only the collection workspace reconciliation and focused sale/reconciliation tests are in scope. Do not change lineup persistence semantics, unrelated contracts work, or deploy behavior. Validate with the relevant test suite and `npm run check`.

## Acceptance criteria

1. After a successful sale and collection refresh, the sold player/coach cannot remain selected in the editor draft.
2. Still-owned selections and their roles remain unchanged.
3. Repeating the same sale request does not produce a second ledger credit.
4. Discarding local edits and reopening the team shows the server-persisted lineup, without the sold card.
