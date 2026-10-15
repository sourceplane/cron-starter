import { beforeEach, describe, expect, it, vi } from "vitest";
import { CRON_ORIGIN, makeScheduled } from "@/lib/scheduled";

// The scheduled handler is the bridge between a Cron Trigger (which hands the
// Worker only the expression that fired) and the template's HTTP route that
// Vercel used to call on that schedule.
const env = { KV: {}, ASSETS: {} } as unknown as CloudflareEnv;
const ctx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
} as unknown as ExecutionContext;

const controller = (cron: string): ScheduledController =>
  ({ cron, scheduledTime: Date.now(), noRetry: vi.fn() }) as unknown as ScheduledController;

describe("the scheduled handler (lib/scheduled.ts)", () => {
  const fetch = vi.fn(async () => new Response('"OK"', { status: 200 }));
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const log = vi.spyOn(console, "log").mockImplementation(() => {});

  beforeEach(() => {
    fetch.mockClear();
    warn.mockClear();
    log.mockClear();
  });

  it("turns `* * * * *` into a GET of /api/cron/1m through the fetch handler", async () => {
    await makeScheduled(fetch)(controller("* * * * *"), env, ctx);
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

  it("routes each of the seven expressions to its own interval", async () => {
    const table: Array<[string, string]> = [
      ["*/10 * * * *", "10m"],
      ["0 * * * *", "1h"],
      ["0 */12 * * *", "12h"],
      ["0 0 * * *", "1d"],
      ["0 0 * * 0", "1w"],
      ["0 0 1 * *", "1mo"],
    ];
    for (const [cron, interval] of table) {
      fetch.mockClear();
      await makeScheduled(fetch)(controller(cron), env, ctx);
      const [request] = fetch.mock.calls[0] as unknown as [Request];
      expect(new URL(request.url).pathname).toBe(`/api/cron/${interval}`);
    }
  });

  it("calls nothing for an expression the table does not know", async () => {
    await makeScheduled(fetch)(controller("5 4 * * *"), env, ctx);
    expect(fetch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("fails the invocation when the route does not answer 2xx", async () => {
    const failing = vi.fn(async () => new Response("boom", { status: 500 }));
    await expect(
      makeScheduled(failing)(controller("0 0 * * *"), env, ctx),
    ).rejects.toThrow("/api/cron/1d answered 500: boom");
  });
});
