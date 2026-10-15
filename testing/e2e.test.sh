#!/usr/bin/env bash
# TIER 2 — the product a bootstrap produces builds, deploys (dry), serves, and
# runs its schedules.
#
# placement.test.sh proves the tree a bootstrap ends with is the right tree.
# This proves it WORKS, by doing to it what its own pipelines will:
#
#   1. at the 01-product landing (the commit its one pull request merges),
#      run what `checks.yml` runs on that PR — install with the lockfile the
#      phase confirmed, render the wrangler fixture and check the committed
#      config IS that render, typecheck, lint, test, build. The landing WAITS
#      on those checks, so a product they refuse is a bootstrap that never
#      merges;
#   2. the stage lane's own steps, rendered by `orun plan` in the product for
#      a pull request (the verify profile: the deploy profile has no dry run)
#      — `verify-app-structure` (which checks the wrangler config exists
#      BEFORE anything is built), `build-app` (the component's buildCommand:
#      the live wiring render, then the build), `verify-build-output` and
#      `deploy-dry-run` (`wrangler deploy --dry-run --name <reponame>-web-stage`).
#      They run IN THE TREE THE RUNNER STAGES for the job
#      (testing/lib/stage-job.py), with the dependency layout the pinned
#      composition produces, and with the stage wiring document in the job's
#      environment as the platform resolves it (the component's secretEnv) —
#      so the namespace id in the built config is asserted to be the
#      document's, not the fixture's — and the config the build rendered is
#      asserted to keep the Worker's custom entry (`worker.ts`, which adds the
#      scheduled handler) and its ONE Cron Trigger (every minute; the seven
#      schedules are dispatched from it);
#   3. serve the built Worker from that tree with `wrangler dev
#      --test-scheduled` and exercise THE CRON PATH: the component's OWN
#      `smokeCommand` (the check the real deploy ends with), verbatim, must
#      REFUSE the Worker before any trigger has fired; then the trigger is
#      fired through the scheduled handler — `GET /__scheduled?cron=*+*+*+*+*`
#      on the clock, then at crafted scheduled times through wrangler's local
#      trigger route (`/cdn-cgi/local/scheduled?cron=…&time=…`, because
#      `/__scheduled` always stamps the present) — and at each time exactly
#      the schedules due then must run `/api/cron/<interval>` through the
#      OpenNext fetch handler, every other record staying as it was; each
#      record is read back through `/api/data/<interval>` — the route only
#      the Worker answers, reading its KV binding (wrangler dev provides the
#      namespace locally); then the smoke must PASS. Then every
#      other route the page promises: the heading and title carry the
#      product's name, the links its repository, the Open Graph image is
#      absolute on the origin it was asked on, the static assets are served,
#      the public cron route runs a schedule on request as Vercel's did, and
#      an unknown path is a 404.
#
# What it cannot do is the platform's half: create the repository, mint the
# brokered Cloudflare token, apply the namespace, deploy for real, have
# Cloudflare's clock fire the trigger, and probe workers.dev. The KV root is
# verified to `terraform validate` (CR2) and its plan is part of every pull
# request's lanes; the apply needs an account.
#
# Needs: orun, node, pnpm, python3 (+PyYAML), git, curl, and the network for
# `pnpm install` and for Hacker News, which every scheduled run calls (as
# upstream). A few minutes: two installs and builds.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
# shellcheck source=lib/bootstrap.sh
source "$here/lib/bootstrap.sh"

for bin in orun node pnpm python3 git curl; do
  command -v "$bin" >/dev/null || { echo "e2e.test.sh needs $bin on PATH" >&2; exit 1; }
done

scratch="$(mktemp -d)"
dev_pid=""
# wrangler dev runs under pnpm, node and two workerd processes; a TERM to the
# first does not reach the rest, and waiting on it then never returns. So it is
# started as its own process group (setsid) and the whole group is stopped.
cleanup() {
  if [ -n "$dev_pid" ]; then
    kill -TERM -- "-$dev_pid" 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 -- "-$dev_pid" 2>/dev/null || break; sleep 0.5; done
    kill -KILL -- "-$dev_pid" 2>/dev/null || true
  fi
  rm -rf "$scratch"
}
trap cleanup EXIT
values="$here/fixtures/acme.json"
repo="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['reponame'])" "$values")"
export CI=1 WRANGLER_SEND_METRICS=false NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1

# What checks.yml runs, step for step, read out of the workflow the product
# carries so the two cannot drift: every `run:` of its one job, in order.
checks() { # DIR LOG
  local dir="$1" log="$2" cmd
  while IFS= read -r cmd; do
    echo "   \$ $cmd" | tee -a "$log"
    if ! (cd "$dir" && bash -c "$cmd") >> "$log" 2>&1; then
      echo "FAIL: \`$cmd\` failed in $dir" >&2; tail -40 "$log" >&2; return 1
    fi
  done < <(python3 - "$dir/.github/workflows/checks.yml" <<'PY'
import sys, yaml
wf = yaml.safe_load(open(sys.argv[1]))
for job in wf["jobs"].values():
    for step in job["steps"]:
        if "run" in step:
            print(step["run"].strip())
PY
)
}

echo "── the offline bootstrap (testing/lib/bootstrap.sh)"
tree="$scratch/$repo"
bootstrap_offline "$root" "$tree" "$values" "$scratch/logs" > "$scratch/bootstrap.log" 2>&1 || {
  echo "FAIL: the offline bootstrap stopped" >&2; tail -40 "$scratch/bootstrap.log" >&2; exit 1; }
echo "   2 phases placed and landed"
s01="$(git -C "$tree" rev-parse HEAD~1)"

# ── 1. the product's one pull request ──────────────────────────────────────
echo "── 01-product's landing, under the checks its PR waits on"
git -C "$tree" worktree add -q "$scratch/at-01" "$s01"
checks "$scratch/at-01" "$scratch/checks-01.log"
# The first Checks build is done; its tree is not needed again, and the disk is shared.
git -C "$tree" worktree remove --force "$scratch/at-01"

# ── 2. the stage lane's steps, in the job's own tree ──────────────────────
echo "── the stage lane: verify-app-structure, build-app, verify-build-output, deploy-dry-run"
# A pull request that changes the page: the lane `orun plan` gives it.
git -C "$tree" checkout -q -b e2e-pr
echo "<!-- a change to the page's component -->" >> "$tree/apps/web/README.md"
git -C "$tree" -c user.email=e2e@example.invalid -c user.name=e2e commit -qam "a pull request"
(cd "$tree" && orun plan --intent intent.yaml --trigger github-pull-request --changed \
   --base main --head HEAD --env stage --output "$scratch/plan.json") > "$scratch/plan.log" 2>&1 \
  || { echo "FAIL: orun plan" >&2; tail -15 "$scratch/plan.log" >&2; exit 1; }
python3 - "$scratch/plan.json" "$scratch/steps" <<'PY'
import json, pathlib, sys
plan = json.load(open(sys.argv[1]))
out = pathlib.Path(sys.argv[2]); out.mkdir()
job = next(j for j in plan["jobs"] if j["component"] == "web" and j["environment"] == "stage")
for s in job["steps"]:
    if s["id"] in ("verify-app-structure", "build-app", "verify-build-output", "deploy-dry-run"):
        (out / f"{s['id']}.sh").write_text(s.get("run") or "")
    if s["id"] == "install-workspace-dependencies":
        (out / "install.sh").write_text(s.get("run") or "")
        (out / "install.wd").write_text(s.get("working-directory") or ".")
        (out / "install.scope").write_text(s.get("scope") or "job")
(out / "path").write_text(job.get("path") or "apps/web")
for k, v in (job.get("env") or {}).items():
    (out / "env").open("a").write(f"export {k}={json.dumps(v)}\n")
(out / "secrets").write_text("\n".join(r["asEnv"] for r in job.get("secretRefs") or []))
PY
# The job's private tree, staged as orun stages it. The source checkout
# carries no build output (nothing was built in it), and its dependencies are
# what the pinned composition says: a lane-scoped install ran once in the
# source tree and is linked in, or the job installs its own.
work="$tree/.orun/runs/e2e/web.stage.verify-deploy/work"
[ -f "$scratch/steps/install.sh" ] || { echo "FAIL: the stage lane has no install step" >&2; exit 1; }
if [ "$(cat "$scratch/steps/install.scope")" = lane ]; then
  (cd "$tree" && bash -e "$scratch/steps/install.sh") > "$scratch/install.log" 2>&1 \
    || { echo "FAIL: the lane's install step" >&2; tail -30 "$scratch/install.log" >&2; exit 1; }
  python3 "$here/lib/stage-job.py" "$tree" "$work" --shared-deps
  [ -L "$work/node_modules" ] || { echo "FAIL: the staged tree's node_modules is not the lane's symlink" >&2; exit 1; }
  echo "   staged: $(realpath --relative-to="$tree" "$work"); install scope: lane — node_modules → the source tree's"
else
  python3 "$here/lib/stage-job.py" "$tree" "$work"
  echo "   staged: $(realpath --relative-to="$tree" "$work"); install scope: job — installing inside it"
  echo "   ▸ install-workspace-dependencies"
  (cd "$work/$(cat "$scratch/steps/path")/$(cat "$scratch/steps/install.wd")" && bash -e "$scratch/steps/install.sh") \
    > "$scratch/install.log" 2>&1 || { echo "FAIL: the lane's install step" >&2; tail -30 "$scratch/install.log" >&2; exit 1; }
  [ -d "$work/node_modules" ] && [ ! -L "$work/node_modules" ] \
    || { echo "FAIL: the job's install did not land inside its own tree" >&2; exit 1; }
fi
[ ! -e "$work/apps/web/.open-next" ] || { echo "FAIL: the staged tree carries build output" >&2; exit 1; }
# What the platform resolves into the job before its first step: the wiring
# documents the KV root lease-published (the component's secretEnv). Ids no
# fixture carries, so the built config proves which one it was rendered from.
for env in stage prod; do
  key="WIRING_CLOUDFLARE_KV_$(echo "$env" | tr a-z A-Z)"
  grep -qx "$key" "$scratch/steps/secrets" || { echo "FAIL: the stage lane does not resolve $key" >&2; exit 1; }
done
export WIRING_CLOUDFLARE_KV_STAGE='{"app_kv_id":"5ca1ab1e5ca1ab1e5ca1ab1e0000a001","app_kv_title":"stg-'"$repo"'-app-kv-stage"}'
export WIRING_CLOUDFLARE_KV_PROD='{"app_kv_id":"5ca1ab1e5ca1ab1e5ca1ab1e0000a003","app_kv_title":"prod-'"$repo"'-app-kv-prod"}'
for step in verify-app-structure build-app verify-build-output deploy-dry-run; do
  [ -f "$scratch/steps/$step.sh" ] || { echo "FAIL: the stage verify lane has no $step step" >&2; exit 1; }
  echo "   ▸ $step"
  # The runner's per-job environment: the job's env (intent environment
  # `env:`), its resolved secrets, and ORUN_ENVIRONMENT; the step runs in the
  # component's directory.
  if ! (cd "$work/$(cat "$scratch/steps/path")" && \
        { [ -f "$scratch/steps/env" ] && source "$scratch/steps/env"; true; } && \
        export ORUN_ENVIRONMENT=stage && bash -e "$scratch/steps/$step.sh") > "$scratch/$step.log" 2>&1; then
    echo "FAIL: the deploy lane's $step step" >&2; tail -40 "$scratch/$step.log" >&2; exit 1
  fi
done
grep -q '"5ca1ab1e5ca1ab1e5ca1ab1e0000a001"' "$work/apps/web/wrangler.jsonc" \
  || { echo "FAIL: the lane's build did not render the stage namespace id from its wiring document" >&2; exit 1; }
grep -q 'env.KV' "$scratch/deploy-dry-run.log" && grep -q '5ca1ab1e5ca1ab1e5ca1ab1e0000a001' "$scratch/deploy-dry-run.log" \
  || { echo "FAIL: the dry run does not bind KV to the stage namespace" >&2; tail -20 "$scratch/deploy-dry-run.log" >&2; exit 1; }
# THE CRON PATH SURVIVES THE BUILD. The scheduled handler lives in the custom
# entry, not in OpenNext's generated worker, and the trigger in the config the
# build re-renders: both must come out of the lane's build intact, and the
# generated worker the entry imports must exist beside them (the composition's
# verify-build-output checks only the entry, which is a source file).
python3 - "$work/apps/web" <<'PY2' || exit 1
import json, pathlib, re, sys
app = pathlib.Path(sys.argv[1])
conf = json.loads(re.sub(r"^\s*//.*$", "", (app / "wrangler.jsonc").read_text(), flags=re.M))
problems = []
if conf.get("main") != "worker.ts":
    problems.append(f"the built config's main is {conf.get('main')!r}, not worker.ts — no scheduled handler")
if (conf.get("triggers") or {}).get("crons") != ["* * * * *"]:
    problems.append(f"the built config's triggers.crons are {(conf.get('triggers') or {}).get('crons')}, not the one every-minute trigger")
if not (app / ".open-next/worker.js").is_file():
    problems.append("the build left no .open-next/worker.js for worker.ts to import")
if "scheduled" not in (app / "worker.ts").read_text():
    problems.append("worker.ts exports no scheduled handler")
for p in problems:
    print(f"FAIL: {p}", file=sys.stderr)
sys.exit(1 if problems else 0)
PY2
echo "   the built config binds KV to the stage document's namespace id, keeps worker.ts (fetch + scheduled)"
echo "   and its one trigger; .open-next/worker.js is there for it; the dry run accepts the bundle"

# ── 3. serve it, fire its schedules, and smoke it as the deploy does ───────
echo "── wrangler dev --test-scheduled over the built Worker"
port=$(python3 -c "import socket;s=socket.socket();s.bind(('127.0.0.1',0));print(s.getsockname()[1]);s.close()")
(cd "$work/apps/web" && exec setsid pnpm exec wrangler dev --config wrangler.jsonc --ip 127.0.0.1 --port "$port" \
   --name "$repo-web-stage" --test-scheduled --show-interactive-dev-session=false) > "$scratch/dev.log" 2>&1 < /dev/null &
dev_pid=$!
url="http://127.0.0.1:$port"
for _ in $(seq 1 90); do
  curl -s -o /dev/null "$url/favicon.ico" && break
  kill -0 "$dev_pid" 2>/dev/null || { echo "FAIL: wrangler dev exited" >&2; tail -30 "$scratch/dev.log" >&2; exit 1; }
  sleep 1
done
curl -s -o /dev/null "$url/favicon.ico" || { echo "FAIL: wrangler dev never answered" >&2; tail -30 "$scratch/dev.log" >&2; exit 1; }

# The component's own smoke, verbatim, under the shell options the
# composition's smoke step sets (it wraps it in a retry loop; here it runs once).
smoke="$(python3 -c "import yaml,sys;print(yaml.safe_load(open(sys.argv[1]))['spec']['parameters']['smokeCommand'])" "$tree/apps/web/component.yaml")"
run_smoke() { DEPLOYED_URL="$url" bash -uo pipefail -c "$smoke"; }

echo "   ▸ the component's own smokeCommand, DEPLOYED_URL=$url, before any trigger fired"
if run_smoke > "$scratch/smoke-before.log" 2>&1; then
  echo "FAIL: the deploy's smoke passed on a Worker no trigger has run — it does not prove the cron" >&2; exit 1
fi
echo "     refused: no run recorded yet"

echo "   ▸ the one trigger fired through the scheduled handler, on the clock and at crafted times"
python3 - "$url" "$tree/apps/web/lib/crons.ts" "$scratch/dev.log" <<'PY'
import json, re, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone
base, crons_ts, devlog = sys.argv[1], sys.argv[2], sys.argv[3]
src = open(crons_ts).read()
crons = re.findall(r"\{ interval: '([^']+)', cron: '([^']+)' \}", src)
intervals = [i for i, _ in crons]
trigger = re.search(r"export const TRIGGER = '([^']+)'", src).group(1)
problems = []
def bad(m): problems.append(m)
def get(path):
    try:
        with urllib.request.urlopen(base + path, timeout=120) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
def records():
    out = {}
    for i in intervals:
        s, body = get(f"/api/data/{i}")
        try:
            out[i] = json.loads(body).get("fetchedAt") if s == 200 else ("error", s)
        except ValueError:
            out[i] = ("error", s)
    return out
def log():
    return open(devlog, errors="replace").read()
if len(crons) != 7 or trigger != "* * * * *":
    sys.exit(f"lib/crons.ts lists {len(crons)} schedules and the trigger {trigger!r}")
q = urllib.parse.quote

# Nothing is recorded before a trigger fires: the namespace is the job tree's own.
for i, at in records().items():
    if at is not None:
        bad(f"/api/data/{i} answered {at!r} before any trigger fired")

# An expression that is not the Worker's trigger runs nothing, and fails nothing.
s, body = get("/__scheduled?cron=" + q("30 4 * * *"))
if s != 200:
    bad(f"a foreign expression made the scheduled handler answer {s}: {body[:120]!r}")
time.sleep(1)
if 'no route for cron "30 4 * * *"' not in log():
    bad("the foreign expression was not reported by the scheduled handler")
if any(at is not None for at in records().values()):
    bad("a foreign expression wrote a record")

# The trigger, on the clock: /__scheduled (wrangler dev --test-scheduled).
fired = int(time.time() * 1000)
s, body = get("/__scheduled?cron=" + q(trigger))
if s != 200:
    bad(f"/__scheduled?cron={trigger} answered {s}: {body[:160]!r}")
time.sleep(1)
at = records()["1m"]
if not isinstance(at, int) or not (fired - 5_000 <= at <= int(time.time() * 1000) + 5_000):
    bad(f"/__scheduled ran no /api/cron/1m: /api/data/1m's fetchedAt is {at!r}")
if '/api/cron/1m 200 "OK"' not in log():
    bad("the scheduled handler did not log a 200 from /api/cron/1m")

# The trigger at crafted scheduled times: exactly the schedules due then run.
CASES = [
    ("2026-10-14T09:07:00Z", ["1m"]),                                     # an ordinary minute
    ("2026-10-14T09:10:00Z", ["1m", "10m"]),                              # minute % 10 == 0
    ("2026-10-14T10:00:00Z", ["1m", "10m", "1h"]),                        # the top of an hour
    ("2026-10-14T12:00:00Z", ["1m", "10m", "1h", "12h"]),                 # noon
    ("2026-10-15T00:00:00Z", ["1m", "10m", "1h", "12h", "1d"]),           # midnight, a Thursday
    ("2026-10-19T00:00:00Z", ["1m", "10m", "1h", "12h", "1d"]),           # midnight, a Monday
    ("2026-10-18T00:00:00Z", ["1m", "10m", "1h", "12h", "1d", "1w"]),     # midnight, a Sunday (0 0 * * 0)
    ("2026-12-01T00:00:00Z", ["1m", "10m", "1h", "12h", "1d", "1mo"]),    # midnight on the 1st, a Tuesday
]
for iso, due in CASES:
    when = int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000)
    before = records()
    time.sleep(0.05)
    s, body = get(f"/cdn-cgi/local/scheduled?cron={q(trigger)}&time={when}&format=json")
    if s != 200:
        bad(f"the trigger at {iso} answered {s}: {body[:200]!r}"); continue
    after = records()
    ran = [i for i in intervals if after[i] != before[i]]
    if ran != due:
        bad(f"the trigger at {iso} ran {ran}; due then: {due}")
    for i in due:
        if not isinstance(after[i], int):
            bad(f"/api/data/{i} answered {after[i]!r} after the trigger at {iso}")

final = records()
for i in intervals:
    s, body = get(f"/api/data/{i}")
    record = json.loads(body) if s == 200 else {}
    if not isinstance(record.get("fetchedAt"), int) or not isinstance(record.get("id"), int):
        bad(f"/api/data/{i} does not read its run back (fetchedAt and a Hacker News story id): {body[:120]!r}")
if problems:
    for p in problems:
        print(f"  ✕ {p}", file=sys.stderr)
    sys.exit(1)
print(f"     /__scheduled?cron={trigger} ran /api/cron/1m; at {len(CASES)} crafted times exactly the due schedules ran")
print(f"     (1m always · 10m · 1h · 12h · 1d · 1w on Sunday · 1mo on the 1st), the rest untouched; a foreign")
print(f"     expression runs nothing; all {len(intervals)} records read back through /api/data/<interval>")
PY

echo "   ▸ the component's own smokeCommand, after the trigger fired"
run_smoke > "$scratch/smoke-after.log" 2>&1 \
  || { echo "FAIL: the deploy's smoke refused a Worker whose every-minute trigger has run" >&2; cat "$scratch/smoke-after.log" >&2; exit 1; }
echo "     passed: /api/data/1m carries the run the trigger recorded"

echo "   ▸ every other route the page promises"
python3 - "$url" "$values" <<'PY'
import html, json, re, sys, time, urllib.error, urllib.request
base, values = sys.argv[1], json.load(open(sys.argv[2]))
name, repo, org = values["productname"], values["reponame"], values["githuborg"]
problems = []
def bad(m): problems.append(m)
def get(path):
    try:
        with urllib.request.urlopen(base + path, timeout=60) as r:
            return r.status, r.headers.get("content-type", ""), r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("content-type", ""), e.read()

status, _, body = get("/")
page = body.decode()
if status != 200:
    bad(f"/ answered {status}")
h1 = re.search(r"<h1[^>]*>(.*?)</h1>", page, re.S)
if not h1 or html.unescape(re.sub(r"<[^>]+>", "", h1.group(1))).strip() != name:
    bad(f"the page's heading is {h1 and h1.group(1)!r}, not {name!r}")
head = page[:page.find("</head>")]
title = re.search(r"<title[^>]*>(.*?)</title>", head, re.S)
if not title or html.unescape(title.group(1)) != name:
    bad(f"the page's <title> is {title and title.group(1)!r}, not {name!r}")
if not re.search(r'<meta name="description" content="[^"]+"', head):
    bad("the page's head carries no description")
# The layout's repository link and its "Clone & Deploy" button: the product's.
links = [l for l in re.findall(r'href="(https://github\.com/[^"]*)"', page)
         if not l.startswith(("https://github.com/vercel/examples", "https://github.com/HackerNews/"))]
if links != [f"https://github.com/{org}/{repo}"] * 2:
    bad(f"the page's repository links are {links}, not github.com/{org}/{repo} twice")
if re.search(r"(?<![\w-])cron-starter(?![\w-])", page) or "Cron Triggers on Cloudflare" in page:
    bad("the page still carries the baseline's name")
og = re.search(r'<meta property="og:image" content="([^"]+)"', page)
if not og or og.group(1) != f"{base}/thumbnail.png":
    bad(f"og:image is {og and og.group(1)!r} — not absolute on the origin it was asked on ({base})")
# The seven schedules, as the page lists them, are the seven the Worker runs.
for cron in ("* * * * *", "*/10 * * * *", "0 * * * *", "0 */12 * * *", "0 0 * * *", "0 0 * * 0", "0 0 1 * *"):
    if html.escape(cron, quote=False) not in page and cron not in page:
        bad(f"the page does not list the schedule {cron!r}")

# The cron route is public, as Vercel's was: requested over HTTP, it runs the
# schedule now and the record moves forward.
before = json.loads(get("/api/data/1h")[2]).get("fetchedAt") or 0
time.sleep(0.01)
s, _, b = get("/api/cron/1h")
after = json.loads(get("/api/data/1h")[2]).get("fetchedAt") or 0
if s != 200 or b.decode().strip() != '"OK"' or not after > before:
    bad(f"GET /api/cron/1h answered {s} {b[:40]!r} and moved fetchedAt {before} → {after}")

for path, want, ctype in (("/thumbnail.png", 200, "image/png"), ("/favicon.ico", 200, "image/"),
                          ("/no-such-page", 404, "text/html")):
    s, ct, b = get(path)
    if s != want or not ct.startswith(ctype):
        bad(f"{path} answered {s} {ct}, want {want} {ctype}")
    if path.endswith(".png") and b[:8] != b"\x89PNG\r\n\x1a\n":
        bad(f"{path} is not a PNG")

if problems:
    for p in problems:
        print(f"  ✕ {p}", file=sys.stderr)
    sys.exit(1)
print(f"   / (the product's name, links, origin and seven schedules), the public cron route,")
print(f"   the Open Graph image, the static assets and a 404 — the product's own")
PY

echo "e2e.test.sh: ok"
