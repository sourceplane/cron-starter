import type { GetServerSideProps } from 'next'
import { Layout, Text, Code, Page, Link } from '@vercel/examples-ui'
import Post from '@/components/post'
import Head from 'next/head'
import { SITE_NAME, requestOrigin } from '@/lib/site'

const intervals = [
  {
    id: '1m',
    name: 'Every Minute',
    cron: '* * * * *',
  },
  {
    id: '10m',
    name: 'Every 10 mins',
    cron: '*/10 * * * *',
  },
  {
    id: '1h',
    name: 'Every Hour',
    cron: '0 * * * *',
  },
  {
    id: '12h',
    name: 'Every 12 hours',
    cron: '0 */12 * * *',
  },
  {
    id: '1d',
    name: 'Every Day',
    cron: '0 0 * * *',
  },
  {
    id: '1w',
    name: 'Every Week',
    cron: '0 0 * * 0',
  },
  {
    id: '1mo',
    name: 'Every Month',
    cron: '0 0 1 * *',
  },
]

const image = '/thumbnail.png'

type Props = { origin: string | null }

// An Open Graph image must be an absolute URL, so the page is rendered per
// request and builds it on the origin it was asked on (lib/site.ts) — right on
// workers.dev, on a custom domain and under `wrangler dev`, with no configured
// site URL. The cron data itself still loads in the browser, as upstream.
export const getServerSideProps: GetServerSideProps<Props> = async ({ req }) => {
  const origin = requestOrigin({
    get: (name) => [req.headers[name]].flat()[0] ?? null,
  })
  return { props: { origin: origin?.origin ?? null } }
}

export default function Home({ origin }: Props) {
  const imageUrl = origin ? `${origin}${image}` : image
  return (
    <Page>
      <Head>
        <meta property="og:image" content={imageUrl} />
        <meta name="twitter:image" content={imageUrl} />
      </Head>
      <section className="flex flex-col gap-6">
        <Text variant="h1">{SITE_NAME}</Text>
        <Text>
          This example shows you how you can use{' '}
          <Link
            href="https://developers.cloudflare.com/workers/configuration/cron-triggers/"
            target="_blank"
            rel="noreferrer noopener"
          >
            Cloudflare Cron Triggers
          </Link>{' '}
          to update data at different intervals.
        </Text>
        <Text>
          Each of the following sections are the{' '}
          <Link
            href="https://github.com/HackerNews/API#new-top-and-best-stories"
            target="_blank"
            rel="noreferrer noopener"
          >
            newest stories on Hacker News
          </Link>{' '}
          retrieved at different intervals using{' '}
          <Link
            href="https://developers.cloudflare.com/workers/configuration/cron-triggers/"
            target="_blank"
            rel="noreferrer noopener"
          >
            Cron Triggers
          </Link>{' '}
          and stored in{' '}
          <Link
            href="https://developers.cloudflare.com/kv/"
            target="_blank"
            rel="noreferrer noopener"
          >
            Workers KV
          </Link>
          .
        </Text>
      </section>
      <section className="grid gap-6 mt-10 pt-10 border-t border-gray-300">
        <div className="flex flex-col gap-12">
          {intervals.map((interval) => (
            <div key={interval.id} className="flex flex-col gap-6">
              <div className="flex justify-between items-center">
                <Text variant="h2">{interval.name}</Text>
                <Code>{interval.cron}</Code>
              </div>
              <Post interval={interval.id} />
            </div>
          ))}
        </div>
      </section>
    </Page>
  )
}

Home.Layout = Layout
