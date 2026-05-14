# Multi-stage build for the standalone `detect` Next.js app.

FROM node:22-alpine AS base

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    YARN_CACHE_FOLDER=/tmp/yarn-cache

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# ---------------------------------------------------------------------------
# Dependencies (full, including dev) + Prisma client
# ---------------------------------------------------------------------------
FROM base AS deps
ENV NODE_ENV=development

COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./

RUN set -eux; \
  if [ -f yarn.lock ]; then yarn install --frozen-lockfile --non-interactive && yarn cache clean; \
  elif [ -f package-lock.json ]; then npm ci; \
  else echo "Lockfile not found." >&2; exit 1; \
  fi

COPY prisma ./prisma

# Custom output path is ./node_modules/.prisma/detect-client (see schema.prisma).
RUN SKIP_ENV_VALIDATION=1 \
    DATABASE_URL=mysql://placeholder:placeholder@localhost:3306/placeholder \
    npx prisma generate --schema=./prisma/schema.prisma

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
FROM base AS builder
# Intentionally inherit NODE_ENV=production from base. Setting development
# here mixes the prod and dev React runtimes inside `next build`, which
# breaks static prerender of /404 and /500 with `<Html>` / `useContext null`
# errors. devDependencies are already in node_modules from the deps stage.

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build with placeholders so env validation can run with stable inputs.
# Real env values are injected at runtime via k8s Secret.
RUN SKIP_ENV_VALIDATION=1 \
    DATABASE_URL=mysql://placeholder:placeholder@localhost:3306/placeholder \
    NEXTAUTH_SECRET=placeholder-build-secret-32-chars-min \
    NEXTAUTH_URL=http://localhost:3000 \
    GOOGLE_CLIENT_ID=placeholder \
    GOOGLE_CLIENT_SECRET=placeholder \
    IP_HASH_SALT=placeholder-build-salt-32-chars-min \
    npx next build

RUN rm -rf /app/.next/cache

# ---------------------------------------------------------------------------
# Production deps (pruned)
# ---------------------------------------------------------------------------
FROM base AS prod-deps

COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./

RUN set -eux; \
  if [ -f yarn.lock ]; then yarn install --frozen-lockfile --production --non-interactive; \
  elif [ -f package-lock.json ]; then npm ci --omit=dev; \
  else echo "Lockfile not found." >&2; exit 1; \
  fi; \
  yarn cache clean || true; \
  rm -rf "$YARN_CACHE_FOLDER" /root/.cache

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs \
  && adduser -S -u 1001 nextjs -G nodejs

# Production dependencies (pruned).
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=prod-deps --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=prod-deps --chown=nextjs:nodejs /app/yarn.lock ./yarn.lock

# Generated Prisma client (from deps stage where we ran `prisma generate`).
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

# Schema is needed for `prisma db push` jobs at deploy time.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Standalone Next.js output (server.js + bundled app code).
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Source needed by the `reconcile-subscriptions` CronJob. The script is run via
# `tsx` at execution time — Next.js doesn't trace these files, so we ship them
# explicitly. The footprint is small (< 200 KB).
COPY --from=builder --chown=nextjs:nodejs /app/lib ./lib
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json

USER nextjs

EXPOSE 3000
ENV PORT=3000 \
    HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "server.js"]
