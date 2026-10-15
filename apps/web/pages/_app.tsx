import type { AppProps } from 'next/app'
import type { LayoutProps } from '@vercel/examples-ui/layout'
import { CloudflareWebAnalytics } from '@/components/analytics'

import { getLayout } from '@vercel/examples-ui'
import '@vercel/examples-ui/globals.css'

function App({ Component, pageProps }: AppProps) {
  const Layout = getLayout<LayoutProps>(Component)

  return (
    <Layout
      title="Cron Triggers Example"
      deployButton={{
        repositoryUrl: 'https://github.com/sourceplane/cron-starter',
        customDeployUrl: 'https://github.com/sourceplane/cron-starter',
      }}
      path="solutions/cron"
      description="How to use Cloudflare Cron Triggers to update data at different intervals"
    >
      <Component {...pageProps} />
      <CloudflareWebAnalytics />
    </Layout>
  )
}

export default App
