// Pages-router _app passthrough. Only exists to satisfy Next 14 when the
// pages-router runtime gets pulled in for /404 and /500 fallbacks.
import type { AppProps } from 'next/app';

export default function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
