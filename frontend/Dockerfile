ARG POSTHOG_HOST=https://app.posthog.com
ARG POSTHOG_API_KEY=posthog-api-key

FROM node:16-alpine AS deps
# Install dependencies only when needed. Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
# RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy over dependency files 
COPY package.json package-lock.json next.config.js ./

# Install dependencies
RUN npm ci --only-production


# Rebuild the source code only when needed
FROM node:16-alpine AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
# Copy all files 
COPY . .

ENV NODE_ENV production
ENV NEXT_PUBLIC_ENV production
ARG POSTHOG_HOST
ENV NEXT_PUBLIC_POSTHOG_HOST $POSTHOG_HOST
ARG POSTHOG_API_KEY
ENV NEXT_PUBLIC_POSTHOG_API_KEY $POSTHOG_API_KEY

# Build
RUN npm run build


# Production image
FROM node:16-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

RUN mkdir -p /app/.next/cache/images && chown nextjs:nodejs /app/.next/cache/images
VOLUME /app/.next/cache/images

ARG POSTHOG_API_KEY
ENV NEXT_PUBLIC_POSTHOG_API_KEY=$POSTHOG_API_KEY \
    BAKED_NEXT_PUBLIC_POSTHOG_API_KEY=$POSTHOG_API_KEY

COPY --chown=nextjs:nodejs --chmod=555 scripts ./scripts
COPY --from=builder /app/public ./public
RUN chown nextjs:nodejs ./public/data
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV NEXT_TELEMETRY_DISABLED 1

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s \  
    CMD node scripts/healthcheck.js


CMD ["/app/scripts/start.sh"]
