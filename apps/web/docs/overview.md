# web

The cron example (Next.js on Cloudflare Workers + Static Assets via @opennextjs/cloudflare, with Cron Triggers driving its API routes, per environment)

A Cloudflare Worker with Static Assets (server rendering plus static files), deployed per environment by its CI lane.

|              |                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| Type         | `cloudflare-workers-assets-turbo`                                                                                  |
| Source       | `apps/web`                                                                                                         |
| Package      | `@app/web`                                                                                                         |
| Environments | `dev`: `verify` · `stage`: `verify`, `deploy` on a push to `main` · `prod`: `verify`, `deploy` on a push to `main` |

## Depends on

- **cloudflare-kv** — Provisions the Cloudflare KV namespace the app binds (stage and prod)

## Depended on by

- (none)
