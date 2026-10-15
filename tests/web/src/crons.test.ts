import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { crons, intervalFor } from "@/lib/crons";

// vercel.json's seven crons, verbatim: path → schedule.
const vercelJson: Record<string, string> = {
  "/api/cron/1m": "* * * * *",
  "/api/cron/10m": "*/10 * * * *",
  "/api/cron/1h": "0 * * * *",
  "/api/cron/12h": "0 */12 * * *",
  "/api/cron/1d": "0 0 * * *",
  "/api/cron/1w": "0 0 * * 0",
  "/api/cron/1mo": "0 0 1 * *",
};

describe("the cron table (lib/crons.ts)", () => {
  it("is vercel.json's seven schedules, each with the interval its path named", () => {
    expect(crons.map((c) => [`/api/cron/${c.interval}`, c.cron])).toEqual(
      Object.entries(vercelJson),
    );
  });

  it("maps every expression back to its interval", () => {
    for (const [route, cron] of Object.entries(vercelJson)) {
      expect(intervalFor(cron)).toBe(route.replace("/api/cron/", ""));
    }
  });

  it("answers undefined for an expression no trigger declares", () => {
    expect(intervalFor("30 4 * * *")).toBeUndefined();
    expect(intervalFor("")).toBeUndefined();
  });

  it("is what wrangler.template.jsonc registers as triggers.crons", () => {
    const template = readFileSync(
      path.resolve(__dirname, "../../../apps/web/wrangler.template.jsonc"),
      "utf8",
    );
    const json = JSON.parse(template.replace(/^\s*\/\/.*$/gm, ""));
    expect(json.triggers.crons).toEqual(crons.map((c) => c.cron));
    expect(json.main).toBe("worker.ts");
    expect(json.kv_namespaces[0].binding).toBe("KV");
  });
});
