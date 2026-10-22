# cron-starter — operating contract (for humans and agents)

This is the standing guide to how this site is deployed and operated.
Instance facts (live URLs, workspace, secrets inventory) live in
[deployment.md](deployment.md), rendered from probed reality by the
bootstrap's `02-docs` phase; this file is the contract that stays true
between deployments. It is written to give an agent with repository read
access enough context to reason about and operate the site without any
other source.

## What this system is

Seven scheduled jobs and the page that shows their last runs, on Cloudflare
alone, expressed as an Orun component-native desired-state repo.

- **`infra/terraform/cloudflare-kv`** — one Workers KV namespace per deployed
  environment (`stage`, `prod`), applied by Terraform. After each apply it
  publishes a wiring document — `{app_kv_id, app_kv_title}` — as the Orun
  secret `WIRING_CLOUDFLARE_KV` on that environment.
- **`apps/web`** — one Worker: Next.js built by `@opennextjs/cloudflare`
  plus Static Assets, with ONE **Cron Trigger**, every minute (`triggers.crons`
  in `wrangler.template.jsonc`). Its entry, `worker.ts`, is OpenNext's fetch
  handler plus a `scheduled` handler that checks the seven schedules in
  `lib/crons.ts` against the minute the trigger was scheduled for (UTC) and
  turns each one that is due into `GET /api/cron/<interval>` through that
  fetch handler. The route fetches the newest Hacker News story
  id and writes `{ fetchedAt, id }` under the interval's key in the `KV`
  binding; `/api/data/<interval>` reads it back with the story, and the page
  polls it for each schedule.
- **`tests/web`** — the schedule table, the scheduled handler, the KV shim
  and the two routes against mocks (vitest), verified on the `dev` rung.
- **`tooling/*`** — shared TypeScript and ESLint configuration, and the
  wrangler renderer that turns `wrangler.template.jsonc` plus a wiring
  document into `wrangler.jsonc`.

Environments: **`stage`** and **`prod`** are deployed; **`dev` is
verify-only by design** — lanes build and test, nothing deploys, no KV
namespace exists for it (its build renders the committed fixture), and no
trigger fires there.

## Identity and tenancy

Every remote operation runs against ONE Orun workspace, declared in
`intent.yaml` under `execution.state.workspace` — committed, enforced, and
what CI uses. Do not remove it; headless credentials depend on it. If it
reads `ws_SET_ME`, the bootstrap had no workspace to write: set the real one
before anything else.

## How deployment works

1. Merge (or push) to `main`.
2. CI (`.github/workflows/ci.yml`) runs `orun plan --changed` — only
   components whose files changed are planned — then runs each planned lane
   with `orun run --remote-state`, authenticated by GitHub OIDC (the
   exchange resolves this repository's linked workspace server-side).
3. **The namespace before the Worker.** `cloudflare-kv` applies for the
   environment and publishes `WIRING_CLOUDFLARE_KV`. `apps/web` declares an
   enforced `dependsOn` on it for pushes to `main`, so its deploy starts only
   after that apply — and a job resolves its secrets when it starts, so the
   document is there.
4. `apps/web` renders `wrangler.jsonc` from that document (the real
   namespace id), builds once per environment, and `wrangler deploy` ships
   `cron-starter-web-<env>` with its Cron Trigger. The smoke test fetches
   `/api/data/1m` and requires a `fetchedAt` from the last ten minutes —
   proof the trigger ran the every-minute schedule's route, the Worker wrote
   its namespace, and reads it back. It retries for about four and a half
   minutes, because a new trigger can take minutes to start firing.
5. `prod` deploys after `stage` has converged on the same commit
   (`environments.prod.promotion` in intent.yaml).
6. **The convergence run is the deployment.** A green run means every
   planned lane applied. Failed lanes are retried with
   `gh run rerun --failed`, which resumes the same execution.

On a pull request nothing applies or deploys: the KV root plans, the page
builds and dry-deploys, and the edges in step 3 are advisory.

Caveats that matter:

- A push that touches no component files plans zero lanes — that run is
  green and deployed nothing. Never treat "latest run green" as "site
  converged"; probe the URLs instead.
- A change to `intent.yaml`'s `environments` maps to no component and
  redeploys nothing on its own. Land it with a change under `apps/web`.
- `wrangler.jsonc` is generated. Edit `wrangler.template.jsonc` and run
  `pnpm run wire:fixture`; Checks fails when the two disagree.
- Cron Triggers count per account (Workers Free allows five). This site
  registers one per deployed Worker — two in all — and dispatches its seven
  schedules from it. Add schedules to `lib/crons.ts`, not triggers.
- A trigger change can take up to fifteen minutes to reach every Cloudflare
  location. A smoke that ran out of retries right after a FIRST deploy is
  that; re-run the failed lane.
- Hacker News is called live: if it does not answer, the run throws (the
  previous record stays) and `/api/data/<interval>` answers an error.

## Secrets model

- **Brokered provider secrets**: `CLOUDFLARE_API_TOKEN` (the
  `workers-deploy` scope: Workers Scripts and KV Storage write) and
  `CLOUDFLARE_ACCOUNT_ID` — pointers minted per run from the workspace's
  Cloudflare connection. No long-lived values at rest; nothing to rotate by
  hand. The KV root and the Worker deploy (its trigger included) use the
  same two.
- **Wiring**: `WIRING_CLOUDFLARE_KV` on `stage` and `prod`, written by the
  KV root's apply (lease-published), read by the Worker's build as
  `WIRING_CLOUDFLARE_KV_<ENV>`. It holds ids, not credentials.
- Inspect by NAME only: `orun secrets list --org <ws> --project` and
  `--env stage|prod`. No tooling in this repository prints a secret value,
  and no document in `ai/context/` may contain one.
- The Worker needs no runtime secret. Hacker News needs no key.

## Verifying the system

```bash
# each environment's last every-minute run (also recorded, probed, in
# deployment.md): fetchedAt moves forward once a minute
curl -s https://cron-starter-web-stage.your-workers-subdomain.workers.dev/api/data/1m | grep -Eo '"fetchedAt":[0-9]+'
curl -s -o /dev/null -w '%{http_code}\n' https://cron-starter-web-prod.your-workers-subdomain.workers.dev/

# each trigger's invocations, live
pnpm --filter @app/web exec wrangler tail cron-starter-web-prod --format pretty

# the wiring the deploys read, and workspace readiness
orun secrets list --org <ws> --env stage && orun secrets list --org <ws> --env prod
orun integrations list --org <ws> --json && orun cloud check --org <ws>
```

## Common operations

| task | how |
|---|---|
| change the page | edit `apps/web/pages/index.tsx` (its name and links: `apps/web/lib/site.ts`), merge |
| change a schedule | edit its expression in `apps/web/lib/crons.ts` (and the one `pages/index.tsx` shows), merge. The trigger stays `* * * * *`: the scheduled handler dispatches every schedule from it |
| run a schedule now | `curl https://<worker>/api/cron/<interval>` (the route is public) |
| deploy a change | merge to `main`; watch the run; failed lanes → `gh run rerun --failed` |
| redeploy without a change | edit the last line of `apps/web/component.yaml` (`# orun: redeploy <reason> <stamp>`) and merge — it is a deploy trigger, nothing reads it |
| add a binding (R2, D1, another KV) | a Terraform root under `infra/terraform/` that publishes `WIRING_<ROOT>`, a token in `wrangler.template.jsonc`, its fixture entry, the root in the build's `--components`, the `WIRING_<ROOT>_<ENV>` secretEnv and an enforced `dependsOn` on it in `apps/web/component.yaml` |
| forget a schedule's last run | `wrangler kv key delete <interval> --namespace-id <id> --remote` (the id is in the environment's `WIRING_CLOUDFLARE_KV`) |
| serve a custom domain | attach it to the Worker in Cloudflare (README, "Custom domain"), then replace the placeholder `cron-starter.example.com` in `intent.yaml`'s `BASE_DOMAIN` with it |
| add a runtime secret | `orun secrets set <KEY> --org <ws> --env <env>` |
| headless credentials | `ORUN_TOKEN` (workspace-scoped) + `GITHUB_TOKEN` |

The deployment record is the bootstrap's `02-docs` phase. Re-running it (the
Orun console's Retry on that phase, or `orun new … --phase 02-docs`)
re-probes the URLs and re-renders [deployment.md](deployment.md); it is
idempotent.

## Evolution

A job that must not run twice, or must run longer than a scheduled
invocation allows, is a Workflow or a Queue consumer the handler hands off
to. Structural changes follow the same
contract that deployed the site: add a component under `apps/`, `infra/` or
`packages/` with a `component.yaml`, land it as a pull request, and the
convergence run applies it.
