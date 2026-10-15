import { getCloudflareContext } from '@opennextjs/cloudflare'

// `@vercel/kv`'s `kv.set` / `kv.get` surface over the KV Workers KV binding,
// so the API routes stay as written apart from the import. Values are JSON
// (Vercel KV serialised objects the same way); `set` answers "OK" as the Redis
// client did, `get` answers null for a missing key.
export const kv = {
  async set(key: string, value: unknown): Promise<'OK'> {
    const { env } = await getCloudflareContext({ async: true })
    await env.KV.put(key, JSON.stringify(value))
    return 'OK'
  },

  async get<T>(key: string): Promise<T | null> {
    const { env } = await getCloudflareContext({ async: true })
    return env.KV.get<T>(key, 'json')
  },
}
