// Minimal pages-router _document so Next.js can prerender its built-in
// /404 and /500 fallbacks. App Router (app/) is the source of truth for
// every real route — this file exists only to keep `next build` happy.
import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="zh-CN">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
