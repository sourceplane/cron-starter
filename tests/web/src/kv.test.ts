import { beforeEach, describe, expect, it, vi } from "vitest";

// lib/kv.ts is `@vercel/kv`'s set/get surface over the KV binding: JSON in,
// JSON out, "OK" from set, null for a missing key.
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

describe("kv (lib/kv.ts)", () => {
  beforeEach(() => {
    store.clear();
    namespace.get.mockClear();
    namespace.put.mockClear();
  });

  it("set stores the value as JSON and answers OK, like the Redis client", async () => {
    const { kv } = await import("@/lib/kv");
    const result = await kv.set("1m", { fetchedAt: 1700000000000, id: 42 });
    expect(result).toBe("OK");
    expect(namespace.put).toHaveBeenCalledWith(
      "1m",
      JSON.stringify({ fetchedAt: 1700000000000, id: 42 }),
    );
  });

  it("get parses what set stored", async () => {
    const { kv } = await import("@/lib/kv");
    await kv.set("1h", { fetchedAt: 1, id: 7 });
    expect(await kv.get<{ fetchedAt: number; id: number }>("1h")).toEqual({
      fetchedAt: 1,
      id: 7,
    });
    expect(namespace.get).toHaveBeenCalledWith("1h", "json");
  });

  it("get answers null for a key no cron has written", async () => {
    const { kv } = await import("@/lib/kv");
    expect(await kv.get("1mo")).toBeNull();
  });
});
