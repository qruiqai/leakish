// Pages-router /404 fallback. Real not-found rendering lives in app/not-found.tsx;
// this exists so Next 14 has something to statically prerender for the default
// /404 path without falling through to its built-in <Html>-using error page.
export default function Page404() {
  return null;
}
