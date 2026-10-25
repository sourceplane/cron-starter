# 01-product — the product, built in one landing

**Places** every module: the root manifests, CI, tooling and the identity
file; `infra/terraform/cloudflare-kv` (the KV namespace per environment);
`apps/web` (the page and its two API routes, the custom Worker entry and its
scheduled handler, which dispatches the seven schedules, its OpenNext build,
its wrangler template — the one Cron Trigger among it — and fixture, its
deploy contract); `tests/web` (vitest). Then brands them, lands them as
ONE pull request, and watches the ONE convergence that merge triggers.

**Requires** both connections live — GitHub (the App installation on the
OWNER of the repository, the only way the platform sees its pull requests)
and Cloudflare (every deploy credential below is minted from it) — probed,
waited for up to ten minutes each, so the consent can be clicked while it
waits.

## What runs

The run's task set-up — the epic, both milestones, both tasks — runs in the
background from the start (`background: true`), so every hook up to `task`
runs beside it; `task` is the first that waits for it.

| hook | what it does |
|---|---|
| `retouch` | the redeploy marker on the components `.baseline/tasks/01-product.TaskContract.yaml` names: `cloudflare-kv`, `web`, `web-tests` |
| `git-init`, `stage`, `rebrand` | the tree becomes a repository, then the product's |
| `orun-workspace` | intent.yaml's `workspace:` becomes the product's (or `ws_SET_ME`, which fails loudly) |
| `work-tree` | intent.yaml's `work:` block — this repository's epics and tasks — is removed |
| `promotion`, `dev-lanes` | prod's promotion gate and dev's push-to-main activation deferred until `02-docs` |
| `restage`, `rebrand-verify` | the sweep: no identity of this baseline left anywhere |
| `repo` | `orun.repo/ensure@v1` creates `<githuborg>/<reponame>` (or finds it) |
| `link` | the repository becomes the workspace's; `orun cloud check` is the gate |
| `secrets` | `orun.integrations/reconcile@v1`, both keys in one hook, created side by side: `CLOUDFLARE_API_TOKEN` from the `workers-deploy` template (Workers Scripts and KV Storage write, so ONE token applies the namespace and deploys the Worker with its Cron Trigger); `CLOUDFLARE_ACCOUNT_ID`, the connection fact both bind |
| `task` | finds the phase's task and yields its key — waiting, if it must, for the background set-up |
| `land` | one PR bound to the task, its commit checked in the box first (`checks: local`: `orun validate`, then `orun plan` as the PR and as the merge would plan it, under a second); merged without waiting for the PR's CI |
| `converge` (await) | `orun.run/watch@v1` on the merge commit's run, read every 5 s; resumes it up to three times |
| `verify` (await) | `orun.http/probe@v1` on both workers.dev URLs |

## What the convergence does

`orun plan --changed` on the merge plans, with dev's push activation and the
promotion gate deferred:

| lane | waits on | does |
|---|---|---|
| `cloudflare-kv · stage` / `· prod` | nothing | `terraform apply` of `stg-<reponame>-app-kv-stage` / `prod-<reponame>-app-kv-prod`, adopting a namespace of that title if one exists (`adopt.tf`), then lease-publishes `WIRING_CLOUDFLARE_KV` = `{app_kv_id, app_kv_title}` on that environment |
| `stage · web` / `prod · web` | that environment's KV apply (`dependsOn: cloudflare-kv`, `mode: enforced` on main) | resolves `WIRING_CLOUDFLARE_KV_<ENV>` as it starts, renders `wrangler.jsonc` with the real namespace id (and its one trigger), builds with OpenNext, deploys `<reponame>-web-<env>` with its entry `worker.ts`, and smoke-tests it: `/api/data/1m` must carry a `fetchedAt` from the last ten minutes — a run the trigger recorded through the scheduled handler, read back by the Worker. The smoke retries for ~4.5 minutes while the new trigger starts firing |

Stage and prod run side by side. `web-tests` verifies on dev only, on a
pull request. The landing's own pull request runs `plan` alone, and nothing
waits for it — the same plan ran in the box before the push: the baseline's
own CI installed, type-checked, linted, tested and built this exact tree
before the tag was cut.

## Verified

The convergence run for the merge commit is green — the Worker's deploys
resolved `WIRING_CLOUDFLARE_KV` from stage and prod, where every later run
reads it; `https://<reponame>-web-{stage,prod}.<subdomain>.workers.dev`
answer.

## Troubleshooting

| symptom | cause → fix |
|---|---|
| parks on the `providers` probe | GitHub (on the repository's owner) or Cloudflare is not connected to the workspace. Connect it (console → Integrations), then re-run the phase — the probe is a wait, not a failure |
| stops at `link` | the repository is not linked to the workspace and the credential cannot link it. Allow-list it (console → Settings → Git repos) and re-run the phase |
| `land`: `the landing's own check failed — orun plan for …` | the placed tree does not plan; the next line is orun's error. Nothing was pushed. Fix it and re-run the phase |
| KV lane: `a namespace with this account ID and title already exists` (10014) | `adopt.tf` imports a namespace of the same title; if it was removed, restore it. Two products with the same `reponame` in one account share a title — use a distinct `reponame` |
| KV lane or deploy lane: Authentication error (10000) | the connection's token lacks Workers Scripts or KV Storage write. Re-issue it with the permission groups the console's Connect recipe lists, re-connect, re-run the phase |
| deploy lane: the trigger is refused (a Cron Trigger limit) | the account already has five Cron Triggers (the Workers Free limit) from other Workers; this product adds one per environment. Remove a trigger another Worker no longer needs and re-run the phase |
| smoke fails after its retries: no `fetchedAt` on `/api/data/1m` | the every-minute trigger had not fired yet — a new trigger can take up to fifteen minutes to reach every location — or its run threw (the Worker's logs: `wrangler tail <reponame>-web-<env>`; Hacker News not answering is one cause). `orun.run/watch@v1` resumes the failed lane up to three times; a later attempt finds the run |
| web lane fails resolving `WIRING_CLOUDFLARE_KV_<ENV>` | that environment's KV apply failed or never ran — read its lane; the web lane waits on it, so it shows as not run on a fresh failure |
| web lane `build-app`: `wire: missing wiring documents` | the job started without the document — the `dependsOn` edge is gone from `apps/web/component.yaml`, or the secretEnv names the wrong key |
| web lane `verify-app-structure`: `test -f wrangler.jsonc` fails | `apps/web/wrangler.jsonc` is not committed (an old `.gitignore` entry); render it with `pnpm run wire:fixture` and commit it |
| `build-app` fails: `Symlink apps/web/node_modules/next is invalid, it points out of the filesystem root` | the site's `intent.yaml` pins stack-tectonic ≥ 0.20.0 (lane-scoped install). Pin 0.19.0 — `intent.yaml`'s comment says why |
| smoke fails right after the FIRST deploy | workers.dev route or trigger propagation; the composition retries the first deploy and the smoke with backoff (stack-tectonic ≥ 0.19.0). A convergence resume clears what is left |
| the watch says green, the probe says 404 | another workflow ran on the push and the watch took its run. Only `ci.yml` may run on a push to main |
| convergence failed AFTER the PR merged; re-running lands nothing | the hooks did not run (`--run-hooks`), or the contract names no component — `node tooling/bootstrap/retouch.mjs --check --affects .baseline/tasks/01-product.TaskContract.yaml` in the site's tree says which |
