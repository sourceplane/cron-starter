# Epics

Orun-style work programs. Each epic is a folder carrying `epic.yaml` (the
declaration the platform reads: slug, key prefix, milestones with exit
criteria and task keys) beside its doc set. The pull request that adds the
folder is the adoption; the merge creates the epic in the workspace.

| Epic | Cluster | Status | What it is |
|------|---------|--------|------------|
| [`cron-starter/`](./cron-starter/) | **CR** | ✅ Shipped (`baseline-v1`); live bootstrap pending | Vercel's Cron Jobs example, equivalent in code and function, on Cloudflare Workers with Cron Triggers driving the same API routes and Workers KV holding the timestamps — and an Orun baseline that instantiates it in one landing (CR4) |

As-built ≠ intent: what shipped lives in each epic's `IMPLEMENTATION-STATUS.md`.
