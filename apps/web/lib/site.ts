// The site's identity, written once. The page heading and its <title> read
// SITE_NAME; the layout's repository link and "Clone & Deploy" button go to
// SOURCE_URL. Instantiating the site under a new name rewrites both to that
// name and its repository, so keep them literal and on one line each.
export const SITE_NAME = "Cron Triggers on Cloudflare"
export const SOURCE_URL = "https://github.com/sourceplane/cron-starter"

// The origin a request was made to, for the page's absolute URLs (the Open
// Graph image). The page renders per request, so the site needs no configured
// origin: on workers.dev, on a custom domain or under `wrangler dev` it is
// whatever host the visitor asked for.
export function requestOrigin(headers: {
  get(name: string): string | null | undefined
}): URL | undefined {
  const host = headers.get('x-forwarded-host') ?? headers.get('host')
  if (!host) return undefined
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)
  const proto = headers.get('x-forwarded-proto') ?? (local ? 'http' : 'https')
  try {
    return new URL(`${proto}://${host}`)
  } catch {
    return undefined
  }
}
