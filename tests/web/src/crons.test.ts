import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { TRIGGER, crons, dueIntervals, matches } from "@/lib/crons";

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

const at = (iso: string) => Date.parse(iso);

describe("the cron table (lib/crons.ts)", () => {
  it("is vercel.json's seven schedules, each with the interval its path named", () => {
    expect(crons.map((c) => [`/api/cron/${c.interval}`, c.cron])).toEqual(
      Object.entries(vercelJson),
    );
  });

  it("is dispatched from ONE trigger, the only one wrangler.template.jsonc registers", () => {
    const template = readFileSync(
      path.resolve(__dirname, "../../../apps/web/wrangler.template.jsonc"),
      "utf8",
    );
    const json = JSON.parse(template.replace(/^\s*\/\/.*$/gm, ""));
    expect(TRIGGER).toBe("* * * * *");
    expect(json.triggers.crons).toEqual([TRIGGER]);
    expect(json.main).toBe("worker.ts");
    expect(json.kv_namespaces[0].binding).toBe("KV");
  });
});

describe("dueIntervals: the schedules due at a trigger's scheduled time (UTC)", () => {
  const cases: Array<[string, string, string[]]> = [
    ["an ordinary minute", "2026-10-14T09:07:00Z", ["1m"]],
    ["a tenth minute", "2026-10-14T09:10:00Z", ["1m", "10m"]],
    ["the top of an hour", "2026-10-14T10:00:00Z", ["1m", "10m", "1h"]],
    ["noon", "2026-10-14T12:00:00Z", ["1m", "10m", "1h", "12h"]],
    ["midnight on a Thursday", "2026-10-15T00:00:00Z", ["1m", "10m", "1h", "12h", "1d"]],
    ["midnight on a Sunday (`0 0 * * 0`)", "2026-10-18T00:00:00Z", ["1m", "10m", "1h", "12h", "1d", "1w"]],
    ["midnight on a Monday is not the weekly run", "2026-10-19T00:00:00Z", ["1m", "10m", "1h", "12h", "1d"]],
    ["midnight on the 1st, a Tuesday", "2026-12-01T00:00:00Z", ["1m", "10m", "1h", "12h", "1d", "1mo"]],
    ["midnight on the 1st, a Sunday: all seven", "2026-11-01T00:00:00Z", ["1m", "10m", "1h", "12h", "1d", "1w", "1mo"]],
    ["12:00 is due for 12h, 06:00 is not", "2026-10-14T06:00:00Z", ["1m", "10m", "1h"]],
    ["the seconds of the scheduled time do not matter", "2026-10-14T09:10:59.999Z", ["1m", "10m"]],
  ];
  for (const [name, iso, want] of cases) {
    it(`${name} (${iso})`, () => {
      expect(dueIntervals(at(iso))).toEqual(want);
    });
  }

  it("reads 7 as Sunday, and lists, ranges and steps", () => {
    expect(matches("0 0 * * 7", new Date(at("2026-10-18T00:00:00Z")))).toBe(true);
    expect(matches("15,45 9-17/2 * * 1-5", new Date(at("2026-10-14T11:45:00Z")))).toBe(true);
    expect(matches("15,45 9-17/2 * * 1-5", new Date(at("2026-10-14T10:45:00Z")))).toBe(false);
  });

  it("fires on either restricted day field, as cron(8) does", () => {
    expect(matches("0 0 1 * 1", new Date(at("2026-10-19T00:00:00Z")))).toBe(true); // a Monday
    expect(matches("0 0 1 * 1", new Date(at("2026-12-01T00:00:00Z")))).toBe(true); // the 1st
    expect(matches("0 0 1 * 1", new Date(at("2026-10-14T00:00:00Z")))).toBe(false);
  });

  it("refuses what it cannot read rather than guess", () => {
    expect(() => matches("* * * *", new Date())).toThrow();
    expect(() => matches("61 * * * *", new Date())).toThrow();
    expect(() => matches("@hourly * * * *", new Date())).toThrow();
  });
});
