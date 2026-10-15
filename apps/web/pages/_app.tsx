import type { AppProps } from 'next/app'
import type { LayoutProps } from '@vercel/examples-ui/layout'
import Head from 'next/head'
import { CloudflareWebAnalytics } from '@/components/analytics'
import { SITE_NAME, SOURCE_URL } from '@/lib/site'

import { getLayout } from '@vercel/examples-ui'
import '@vercel/examples-ui/globals.css'

function App({ Component, pageProps }: AppProps) {
  const Layout = getLayout<LayoutProps>(Component)

  // The <title> is the site's name (lib/site.ts), and it and the description
  // are rendered here rather than through the layout's `title`/`description`
  // props: the layout's own <Head> does not reach the server-rendered page,
  // and it would suffix the title with " - Vercel Examples".
  return (
    <Layout
      deployButton={{
        repositoryUrl: SOURCE_URL,
        customDeployUrl: SOURCE_URL,
      }}
      path="solutions/cron"
    >
      <Head>
        <title>{SITE_NAME}</title>
        <meta
          name="description"
          content="How to use Cloudflare Cron Triggers to update data at different intervals"
        />
      </Head>
      <Component {...pageProps} />
      <CloudflareWebAnalytics />
    </Layout>
  )
}

export default App
