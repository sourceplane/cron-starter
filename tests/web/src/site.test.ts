import { describe, expect, it } from "vitest";
import { SITE_NAME, SOURCE_URL, requestOrigin } from "@/lib/site";

// The identity seam a product's bootstrap rewrites, and the origin the page's
// absolute links are built from.
describe("site identity (apps/web/lib/site.ts)", () => {
  it("names the site and links its source repository", () => {
    expect(SITE_NAME.trim()).not.toBe("");
    expect(SOURCE_URL).toMatch(/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[a-z0-9-]+$/);
  });
});

describe("requestOrigin", () => {
  const h = (entries: Record<string, string>) => new Headers(entries);

  it("is the host the visitor asked for, over https", () => {
    expect(requestOrigin(h({ host: "acme-crons-web-prod.acme.workers.dev" }))?.href).toBe(
      "https://acme-crons-web-prod.acme.workers.dev/",
    );
  });

  it("is plain http on a local host (wrangler dev, next dev)", () => {
    expect(requestOrigin(h({ host: "127.0.0.1:8787" }))?.href).toBe("http://127.0.0.1:8787/");
    expect(requestOrigin(h({ host: "localhost:3000" }))?.href).toBe("http://localhost:3000/");
  });

  it("prefers the forwarded host and scheme", () => {
    expect(
      requestOrigin(h({ host: "internal", "x-forwarded-host": "crons.acme.dev", "x-forwarded-proto": "https" }))
        ?.href,
    ).toBe("https://crons.acme.dev/");
  });

  it("reads Node's header object too (getServerSideProps)", () => {
    const node: Record<string, string | string[] | undefined> = { host: "crons.acme.dev" };
    expect(requestOrigin({ get: (name) => [node[name]].flat()[0] ?? null })?.origin).toBe("https://crons.acme.dev");
  });

  it("is undefined without a host, rather than a guess", () => {
    expect(requestOrigin(h({}))).toBeUndefined();
  });
});
