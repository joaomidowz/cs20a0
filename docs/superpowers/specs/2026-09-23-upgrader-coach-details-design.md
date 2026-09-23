# Upgrader coach card details

## Problem

In the Upgrader, player cards open a detail sheet, but coach cards are static and always display their four attribute bars. This makes coach cards behave inconsistently and adds dense stats to every compact coach card.

## Design

Keep the change scoped to the Upgrader. Add compact and optional open behavior to `CoachCard`, matching the existing `CollectionCard` interaction. In compact mode, hide coach attributes on the card face; when the card is opened, show an accessible detail sheet with the enlarged coach card and its attributes. The action buttons for staking or aiming remain separate from the card-open button, so clicking an action never also opens details. Other existing CoachCard consumers retain their current appearance and behavior unless they explicitly opt into compact/open mode.

## Scope and validation

Update the Upgrader, `CoachCard`, the coach detail sheet, and the Upgrader page that owns detail state. Validate interaction/type safety with `npm run check`, run the relevant tests, and build the app. Do not change upgrade rules, server behavior, or coach-card presentation outside the Upgrader.

## Acceptance criteria

1. Compact coach cards in the Upgrader hide all four attribute bars and values.
2. Clicking or keyboard-activating a compact coach card opens a detail sheet showing those attributes.
3. “Stake/aim” action buttons remain independent and do not open the sheet.
4. Dismissing the sheet restores the Upgrader unchanged; player-card details continue to work.
5. Coach cards outside the Upgrader remain unchanged.
