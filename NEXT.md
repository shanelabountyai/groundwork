# Next

**P2 #1 (blob storage for photos) is done**, 2026-09-20: `src/visits/photos.ts`
now saves through a `PhotoStore` interface — `blobPhotoStore` (Vercel Blob,
private access) in deploys, `localPhotoStore` (disk under `uploads/`) when
`BLOB_READ_WRITE_TOKEN` is unset, which is every local dev and e2e run today.
`app/photos/[name]/route.ts` reads through the same store. DB columns and the
dispatcher-gated route are unchanged, as the design brief predicted. See
`docs/decisions.md` → Phase 7. `.env.example` documents `BLOB_READ_WRITE_TOKEN`
(name only — real value comes from linking a Blob store in the Vercel
dashboard, or `vercel env pull` for local testing against the real thing).
Typecheck, `npm test` (70/70), and `npm run test:e2e` (9/9) all green.

**Next up**, in `docs/design-brief.md` → P2, ordered by what unblocks a real
deploy:

1. **Real SMS/email provider** — drop a real implementation into
   `src/notifications/provider.ts`'s `Provider` interface; `drainOutbox`
   doesn't change. `npm run outbox:drain` already drains the outbox with the
   console provider.
2. **Real auth** — replaces `src/session.ts`.
3. **Real routing API** — behind `src/routes/route.ts::estimate`.

A full architecture/build-out map lives in `docs/design-brief.md`.

Known gaps, none blocking:

- **`next dev` appends a `nextjs-agent-rules` block to `CLAUDE.md`.** Decided
  2026-09-20: committed, so the tree stays clean when the tool re-adds it.
  Leave it in place.
- **Route reorder is ↑/↓ buttons, not drag** (P0-4 says drag). Buttons need no
  client JS and work on a phone; drag would be the first real client component.
- **Nothing calls `npm run outbox:drain` yet** — no cron is configured in
  this repo (there's no deploy target). Wire it up when #2 (real deploy) or
  a scheduler exists.
- **Horizon generation and agreement crew changes still skip the capacity
  check** (decisions.md, Phase 2 and 4). The board now colours the overload,
  which was the condition for leaving it.
- **The owner report has no export and no range beyond a week** — deliberate;
  see decisions.md, Phase 5.
- **The make-up offer has no override and looks 14 days ahead** — deliberate;
  see decisions.md, Phase 5, P1-1. A crew with no open slot inside the horizon
  is told to move it by hand.
