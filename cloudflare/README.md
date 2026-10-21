# Shared brachistochrone histogram API

This Cloudflare Worker stores class submissions in D1 while the visualization remains hosted on
GitHub Pages. The initial session is `analytical-mechanics-2026`.

Deployed API: <https://brachistochrone-class-api.villaa-physics.workers.dev>

## API

- `GET /api/sessions/:session/submissions?drop=2.0`
- `POST /api/sessions/:session/submissions`
- `DELETE /api/sessions/:session/submissions?drop=2.0`

POST bodies contain a vertical drop and an idempotent batch of `{ id, time }` submissions. DELETE
requires `Authorization: Bearer <teacher token>`.

## First deployment

1. Install dependencies with `pnpm install`.
2. Authenticate with `pnpm wrangler login`.
3. Run `pnpm run db:create`.
4. Copy the returned database ID into `wrangler.jsonc`.
5. Run `pnpm run db:migrate:remote`.
6. Store the teacher reset passphrase with `pnpm wrangler secret put TEACHER_RESET_TOKEN`.
7. Run `pnpm run deploy`.
8. Put the resulting `workers.dev` URL in `docs/brachistochrone/config.js`.

For local Worker development, create an ignored `.dev.vars` containing
`TEACHER_RESET_TOKEN=your-local-test-token`, apply the local migration, and run `pnpm run dev`.

The Worker accepts browser requests only from the published GitHub Pages origin and the documented
local-development ports.
