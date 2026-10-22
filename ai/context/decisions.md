# cron-starter — decisions

The choices that shape this repository, one line each, with where the full
reasoning lives. Superseded decisions stay listed, marked, so the history
reads in order.

| # | Decision | Why | Source |
|---|---|---|---|
| 1 | OpenNext on Workers + Static Assets, the static-assets incremental cache | The template is a Next.js pages-router app; its API routes run inside the Worker unchanged | `specs/epics/cron-starter/design.md` §2 |
| 2 | One Worker: a custom entry (`worker.ts`) re-exports the generated fetch handler and adds `scheduled`, which calls the route in-process with a synthetic request | A second cron Worker would be another deployable and another render for a dozen-line handler | design.md §7 |
| 3 | `lib/kv.ts` mirrors `@vercel/kv`'s `set`/`get` over the `KV` binding | The routes change only their import | design.md §2 |
| 4 | ONE Cron Trigger per Worker (`* * * * *`); the handler runs every schedule in `lib/crons.ts` due at the trigger's `scheduledTime`. Supersedes CR1–CR3's seven triggers per Worker | Cloudflare caps Cron Triggers per account (five on Workers Free), and the platform cannot check a plan before a deploy | risks CR-B, CR-N |
| 5 | `wrangler.jsonc` is rendered per environment from the KV root's wiring document, and committed as the fixture render; `dev` renders the fixture | The deploy lane checks the file exists before it builds; no root applies to `dev` | risks CR-H, CR-I, design.md §4 |
| 6 | The deploy's smoke reads `/api/data/1m` for a run from the last ten minutes | It proves the trigger and the binding; a first deploy is covered by the landing's resumes | risk CR-J |
| 7 | One landing (`01-product`) then the record (`02-docs`); the plan applies the namespace before the Worker (`dependsOn: cloudflare-kv`, enforced on `main`, advisory on a pull request) | A landing has a fixed cost; the plan, not the phases, carries deploy order (cirrus-baseline since `baseline-v22`) | design.md §8 |
| 8 | The page's name and source link are one seam (`lib/site.ts`); the Open Graph image is absolute on the request's own origin | The rename rewrites one file; no configured site URL | IMPLEMENTATION-STATUS (CR4) |
| 9 | The cron route stays public, as upstream | Upstream sets no `CRON_SECRET`; the guard's shape is documented | risk CR-A |
| 10 | `ci.yml` plans nothing while `intent.yaml` names `ws_CHANGE_ME`; `checks.yml` runs on pull requests only | A bootstrap cannot set a repository variable (replaced the `ORUN_CI` gate); the convergence watch takes the newest run on the merge sha from any workflow | IMPLEMENTATION-STATUS (CR4) |
| 11 | stack-tectonic 0.19.0, not 0.20.0 | 0.20.0's lane-scoped install is refused by Next 16's Turbopack | IMPLEMENTATION-STATUS (CR4), `intent.yaml` |
| 12 | orun is pinned only where it runs (the `orun-action` `version:` in each workflow); no kiox. Component docs are generated from the manifests and checked in CI | `kiox.yaml` pinned a version nothing ran; a hand-written copy of the dependency graph and bindings drifts silently | IMPLEMENTATION-STATUS (CR5), `tooling/catalog/gen-component-docs.py` |
| 13 | The console card reads `subdomain` from the Cloudflare connection (`from: connection.cloudflare.workersSubdomain`); only a hand-run build passes it | It belongs to the account like its id and has one right answer; a typed one could only be wrong, and wrong showed up after deploy (cirrus-baseline since baseline-v23) | `blueprint.yaml`, IMPLEMENTATION-STATUS (CR-7) |
| 14 | The console asks for no domain; an empty `productdomain` brands the placeholder `<reponame>.example.com` | The site goes live on workers.dev and nothing in the build needs a domain; attaching one is an owner's step, and the placeholder keeps every place the domain goes in the repository, ready to replace | `repo-blueprint.yaml`, `tooling/rebrand/rebrand.mjs`, IMPLEMENTATION-STATUS (CR-8) |
