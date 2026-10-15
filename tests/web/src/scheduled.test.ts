import { beforeEach, describe, expect, it, vi } from "vitest";
import { CRON_ORIGIN, makeScheduled } from "@/lib/scheduled";

// The scheduled handler is the bridge between the one Cron Trigger (which
// hands the Worker its expression and the minute it was scheduled for) and
// the template's HTTP routes that Vercel used to call on seven schedules.
const env = { KV: {}, ASSETS: {} } as unknown as CloudflareEnv;
const ctx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
} as unknown as ExecutionContext;

const controller = (cron: string, iso: string): ScheduledController =>
  ({ cron, scheduledTime: Date.parse(iso), noRetry: vi.fn() }) as unknown as ScheduledController;

const paths = (fetch: { mock: { calls: unknown[][] } }) =>
  fetch.mock.calls.map(([request]) => new URL((request as Request).url).pathname);

describe("the scheduled handler (lib/scheduled.ts)", () => {
  const fetch = vi.fn(async () => new Response('"OK"', { status: 200 }));
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const log = vi.spyOn(console, "log").mockImplementation(() => {});

  beforeEach(() => {
    fetch.mockClear();
    warn.mockClear();
    log.mockClear();
  });

  it("on an ordinary minute runs only /api/cron/1m, through the fetch handler", async () => {
    await makeScheduled(fetch)(controller("* * * * *", "2026-10-14T09:07:00Z"), env, ctx);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [request, passedEnv, passedCtx] = fetch.mock.calls[0] as unknown as [
      Request,
      CloudflareEnv,
      ExecutionContext,
    ];
    expect(request.method).toBe("GET");
    expect(new URL(request.url).pathname).toBe("/api/cron/1m");
    expect(request.url.startsWith(CRON_ORIGIN)).toBe(true);
    expect(passedEnv).toBe(env);
    expect(passedCtx).toBe(ctx);
    expect(log).toHaveBeenCalledWith('/api/cron/1m 200 "OK"');
  });

  it("runs every schedule due at the scheduled minute, in table order", async () => {
    const table: Array<[string, string[]]> = [
      ["2026-10-14T09:10:00Z", ["1m", "10m"]],
      ["2026-10-14T12:00:00Z", ["1m", "10m", "1h", "12h"]],
      ["2026-10-18T00:00:00Z", ["1m", "10m", "1h", "12h", "1d", "1w"]],
      ["2026-11-01T00:00:00Z", ["1m", "10m", "1h", "12h", "1d", "1w", "1mo"]],
    ];
    for (const [iso, intervals] of table) {
      fetch.mockClear();
      await makeScheduled(fetch)(controller("* * * * *", iso), env, ctx);
      expect(paths(fetch)).toEqual(intervals.map((i) => `/api/cron/${i}`));
    }
  });

  it("calls nothing for an expression that is not the Worker's trigger", async () => {
    await makeScheduled(fetch)(controller("0 0 * * *", "2026-10-15T00:00:00Z"), env, ctx);
    expect(fetch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("runs the rest when one route fails, then fails the invocation naming it", async () => {
    const failing = vi.fn(async (request: Request) =>
      new URL(request.url).pathname === "/api/cron/1h"
        ? new Response("boom", { status: 500 })
        : new Response('"OK"', { status: 200 }),
    );
    await expect(
      makeScheduled(failing)(controller("* * * * *", "2026-10-15T00:00:00Z"), env, ctx),
    ).rejects.toThrow("/api/cron/1h answered 500: boom");
    expect(paths(failing)).toEqual(["1m", "10m", "1h", "12h", "1d"].map((i) => `/api/cron/${i}`));
  });
});
