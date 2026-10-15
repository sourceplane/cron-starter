// The bindings wrangler.jsonc declares, as the Worker (and `next dev` through
// the platform proxy) sees them, plus the slice of the Workers runtime the
// custom worker entry uses. Hand-typed rather than `@cloudflare/workers-types`
// as a global: that package's `Body.json<T>(): Promise<T>` merges ahead of
// lib.dom's `Promise<any>`, and the template's untyped `res.json()` calls stop
// compiling. Keep in step with wrangler.template.jsonc.
interface CloudflareEnv {
  KV: KVNamespace
  ASSETS: Fetcher
}

interface KVNamespace {
  get<T = unknown>(key: string, type: 'json'): Promise<T | null>
  get(key: string, type?: 'text'): Promise<string | null>
  put(
    key: string,
    value: string,
    options?: { expiration?: number; expirationTtl?: number; metadata?: unknown }
  ): Promise<void>
  delete(key: string): Promise<void>
}

interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void
  passThroughOnException(): void
}

interface ScheduledController {
  readonly cron: string
  readonly scheduledTime: number
  noRetry(): void
}

interface ExportedHandler<Env = unknown> {
  fetch?(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response>
  scheduled?(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): void | Promise<void>
}
