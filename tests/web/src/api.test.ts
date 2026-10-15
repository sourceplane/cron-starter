import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";

// The two API routes are the upstream handlers as written (only the kv import
// changed). The KV binding and Hacker News are mocked; nothing touches the
// network.
const store = new Map<string, string>();
const namespace = {
  get: vi.fn(async (key: string, type?: string) => {
    const raw = store.get(key);
    if (raw === undefined) return null;
    return type === "json" ? JSON.parse(raw) : raw;
  }),
  put: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
};
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { KV: namespace } }),
}));

const newstories = [38001, 38000, 37999];
const item = {
  id: 38001,
  title: "A story",
  by: "someone",
  time: 1700000000,
  score: 3,
  descendants: 1,
};
const hackerNews = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.endsWith("/v0/newstories.json?print=pretty")) {
    return Response.json(newstories);
  }
  if (url.endsWith(`/v0/item/${item.id}.json?print=pretty`)) {
    return Response.json(item);
  }
  // Hacker News answers `null` for an unknown item — including the
  // `/v0/item/undefined.json` the data route asks for before any cron ran.
  return Response.json(null);
});

type Res = NextApiResponse & { statusCode: number; body: unknown };
function mockRes(): Res {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res as unknown as Res;
}
const req = (fields: Partial<NextApiRequest>): NextApiRequest =>
  ({ query: {}, ...fields }) as unknown as NextApiRequest;

describe("the API routes (pages/api)", () => {
  beforeEach(() => {
    store.clear();
    hackerNews.mockClear();
    vi.stubGlobal("fetch", hackerNews);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.useFakeTimers({ now: 1_700_000_000_000 });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("GET /api/cron/1m records the newest story id and the run time under `1m`", async () => {
    const { default: cron } = await import("@/pages/api/cron/[cron]");
    const res = mockRes();
    await cron(req({ url: "/api/cron/1m" }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("OK");
    expect(JSON.parse(store.get("1m")!)).toEqual({
      fetchedAt: 1_700_000_000_000,
      id: newstories[0],
    });
    expect(hackerNews).toHaveBeenCalledWith(
      "https://hacker-news.firebaseio.com/v0/newstories.json?print=pretty",
    );
  });

  it("GET /api/cron/ without an interval is a 400", async () => {
    const { default: cron } = await import("@/pages/api/cron/[cron]");
    const res = mockRes();
    await cron(req({ url: "/api/cron/" }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "No cron provided" });
    expect(store.size).toBe(0);
  });

  it("GET /api/data/1m answers the story plus fetchedAt once the cron has run", async () => {
    const { default: cron } = await import("@/pages/api/cron/[cron]");
    const { default: data } = await import("@/pages/api/data/[interval]");
    await cron(req({ url: "/api/cron/1m" }), mockRes());

    const res = mockRes();
    await data(req({ query: { interval: "1m" } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ fetchedAt: 1_700_000_000_000, ...item });
  });

  it("GET /api/data/1w before any run is an empty object (upstream's shape)", async () => {
    const { default: data } = await import("@/pages/api/data/[interval]");
    const res = mockRes();
    await data(req({ query: { interval: "1w" } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({});
  });

  it("GET /api/data/ without an interval is a 400", async () => {
    const { default: data } = await import("@/pages/api/data/[interval]");
    const res = mockRes();
    await data(req({ query: {} }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "No interval provided" });
  });
});
