# Next

**Phase 3 — P0-5 mobile crew view** (`prd-groundwork-field-service.md`), plus Playwright e2e on a production build.

- State-machine module first (`pending → en_route → completed | skipped`), server-side, TDD. CLAUDE.md rule 3.
- Crew view reads `routeFor(crewId, date)` (src/routes/day.ts). Price must not reach it (rule 6).
- Stop card: access notes prominent, map deep-link, complete with before/after photo + note, skip with reason list + free text.
- 390px viewport is an acceptance criterion from the first spec. Playwright config uses port 3900 and a prod build.
- Seed is ready: `npm run db:seed -- --reset`. Its busiest day is 3 stops, which is light; add density if the board needs it.
- Known gap (decisions.md): generation and agreement crew changes are not capacity-checked.
