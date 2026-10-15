import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// `next dev` reaches the KV binding through wrangler's local platform proxy
// (render apps/web/wrangler.jsonc first: `pnpm run wire:fixture`).
initOpenNextCloudflareForDev()

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required by @opennextjs/cloudflare, which bundles `.next/standalone/**`
  // into the Worker; traced from the monorepo root.
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
}

export default nextConfig
