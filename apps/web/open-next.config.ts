// OpenNext Cloudflare adapter config.
//
// The page is static (no data fetching at render; SWR polls the API routes
// from the browser) and nothing revalidates. The static-assets incremental
// cache serves the pre-rendered page straight from the Worker's static assets
// (read only, no R2/KV/D1 to provision for the cache). The API routes are
// dynamic and run in the Worker. A template that revalidates (ISR,
// `revalidateTag`) swaps this for the R2 incremental cache plus a tag cache.
import { defineCloudflareConfig } from "@opennextjs/cloudflare/config";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
