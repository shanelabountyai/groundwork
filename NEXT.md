# Next

**Phase 2 — P0-3 crew capacity + P0-4 route builder** (`prd-groundwork-field-service.md`).

- Capacity: max stops / max minutes per crew-day; exceeding it needs a logged dispatcher override.
- Route builder: nearest-neighbor from crew home base by haversine, persisted drag order
  (a `routePosition` on Visit), auto-order never re-runs on a touched day unless re-requested.
- Distance label is an estimate (straight-line × road factor), never "drive time".
- TDD the haversine + nearest-neighbor pure module first; fixture: 8 stops beat creation order.
- Also due: Tulsa seed (3 crews, 40 properties) — needed before any UI.
