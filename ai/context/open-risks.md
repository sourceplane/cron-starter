# cron-starter — open risks

What is not yet proven or not yet decided. The full write-up of every risk,
including the accepted and resolved ones, is
`specs/epics/cron-starter/risks-and-open-questions.md`; this page lists only
what is still live, so it should be short.

| ID | Risk | State | What closes it |
|---|---|---|---|
| CR-K | No live bootstrap yet: the repository created and linked, the token minted, a real `terraform apply`, a real `wrangler deploy` registering its trigger, the trigger firing on Cloudflare's clock and the probes are all unproven | OPEN | One bootstrap from a tag against a workspace |

Accepted, and worth knowing before you change them: CR-A (the cron route is
public, as upstream), CR-C (KV is eventually consistent), CR-D (Hacker News
at request time), CR-J (the first deploy's smoke waits on the trigger), CR-L
(the bootstrap floor plans every edge enforced), CR-M (a custom domain is the
owner's step), CR-N (seven schedules on one trigger).
