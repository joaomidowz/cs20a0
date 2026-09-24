# Lineup save dirty state

## Problem

After a lineup save succeeds and the collection refreshes, the page can still show “Alterações não salvas”. `savedLineup` is derived through `lineupAt(activeTab)`, which hides its dependency on `state` from Svelte's reactive dependency tracking. The displayed dirty state can therefore compare the edited lineup with an outdated saved lineup.

## Design

Derive `savedLineup` directly from the reactive collection `state` and `activeTab`. Preserve compatibility with older responses that expose only the active `lineup` instead of the `lineups` array. Keep the existing save request, refresh, hydration, and dirty comparison flow.

## Success criteria

- After a successful save and refresh, the unsaved-changes banner clears when the form matches the saved lineup.
- Genuine edits after saving still show the banner.
- Older collection response shape remains supported.
- Scope remains limited to the collection workspace component.

## Alternatives considered

- Copy the lineup returned by the save request into local state: avoids the stale derived value but adds a second state update path.
- Derive from `state` and `activeTab` directly: recommended because it keeps the saved baseline aligned with the canonical refreshed collection state.
