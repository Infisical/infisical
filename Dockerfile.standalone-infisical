ARG POSTHOG_HOST=https://app.posthog.com
ARG POSTHOG_API_KEY=posthog-api-key
ARG INTERCOM_ID=intercom-id
ARG CAPTCHA_SITE_KEY=captcha-site-key

FROM  node:20-alpine AS base

FROM base AS frontend-dependencies

# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json  ./

# Install dependencies
RUN npm ci --only-production --ignore-scripts

# Rebuild the source code only when needed
FROM base AS frontend-builder
WORKDIR /app

# Copy dependencies
COPY --from=frontend-dependencies /app/node_modules ./node_modules
# Copy all files 
COPY /frontend .

ENV NODE_ENV production
ARG POSTHOG_HOST
ENV VITE_POSTHOG_HOST $POSTHOG_HOST
ARG POSTHOG_API_KEY
ENV VITE_POSTHOG_API_KEY $POSTHOG_API_KEY
ARG INTERCOM_ID
ENV VITE_INTERCOM_ID $INTERCOM_ID
ARG INFISICAL_PLATFORM_VERSION
ENV VITE_INFISICAL_PLATFORM_VERSION $INFISICAL_PLATFORM_VERSION
ARG CAPTCHA_SITE_KEY
ENV VITE_CAPTCHA_SITE_KEY $CAPTCHA_SITE_KEY 

# Build
RUN npm run build

# Production image
FROM base AS frontend-runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 non-root-user

COPY --from=frontend-builder --chown=non-root-user:nodejs /app/dist ./

USER non-root-user

##
## BACKEND
##
FROM base AS backend-build
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 non-root-user

WORKDIR /app

# Install all required dependencies for build
RUN apk --update add \
    python3 \
    make \
    g++ \
    unixodbc \
    freetds \
    unixodbc-dev \
    libc-dev \
    freetds-dev

COPY backend/package*.json ./
RUN npm ci --only-production

COPY /backend .
COPY --chown=non-root-user:nodejs standalone-entrypoint.sh standalone-entrypoint.sh
RUN npm i -D tsconfig-paths
RUN npm run build

# Production stage
FROM base AS backend-runner

WORKDIR /app

# Install all required dependencies for runtime
RUN apk --update add \
    python3 \
    make \
    g++ \
    unixodbc \
    freetds \
    unixodbc-dev \
    libc-dev \
    freetds-dev

# Configure ODBC
RUN printf "[FreeTDS]\nDescription = FreeTDS Driver\nDriver = /usr/lib/libtdsodbc.so\nSetup = /usr/lib/libtdsodbc.so\nFileUsage = 1\n" > /etc/odbcinst.ini

COPY backend/package*.json ./
RUN npm ci --only-production

COPY --from=backend-build /app .

RUN mkdir frontend-build

# Production stage
FROM base AS production

RUN apk add --upgrade --no-cache ca-certificates
RUN apk add --no-cache bash curl && curl -1sLf \
  'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.alpine.sh' | bash \
  && apk add infisical=0.31.1 && apk add --no-cache git

WORKDIR /

# Install all required runtime dependencies
RUN apk --update add \
    python3 \
    make \
    g++ \
    unixodbc \
    freetds \
    unixodbc-dev \
    libc-dev \
    freetds-dev \
    bash \
    curl \
    git \
    openssh

# Configure ODBC in production
RUN printf "[FreeTDS]\nDescription = FreeTDS Driver\nDriver = /usr/lib/libtdsodbc.so\nSetup = /usr/lib/libtdsodbc.so\nFileUsage = 1\n" > /etc/odbcinst.ini

# Setup user permissions
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 non-root-user

# Give non-root-user permission to update SSL certs
RUN chown -R non-root-user /etc/ssl/certs
RUN chown non-root-user /etc/ssl/certs/ca-certificates.crt
RUN chmod -R u+rwx /etc/ssl/certs
RUN chmod u+rw /etc/ssl/certs/ca-certificates.crt
RUN chown non-root-user /usr/sbin/update-ca-certificates
RUN chmod u+rx /usr/sbin/update-ca-certificates

## set pre baked keys
ARG POSTHOG_API_KEY
ENV POSTHOG_API_KEY=$POSTHOG_API_KEY
ARG INTERCOM_ID=intercom-id
ENV INTERCOM_ID=$INTERCOM_ID
ARG CAPTCHA_SITE_KEY
ENV CAPTCHA_SITE_KEY=$CAPTCHA_SITE_KEY


COPY --from=backend-runner /app /backend

COPY --from=frontend-runner /app ./backend/frontend-build


ENV PORT 8080
ENV HOST=0.0.0.0
ENV HTTPS_ENABLED false 
ENV NODE_ENV production
ENV STANDALONE_BUILD true 
ENV STANDALONE_MODE true
WORKDIR /backend

ENV TELEMETRY_ENABLED true

EXPOSE 8080
EXPOSE 443

USER non-root-user

CMD ["./standalone-entrypoint.sh"]
