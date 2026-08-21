ARG NPM_VERSION=11.19.0

FROM node:22.23.2-alpine AS base
ARG NPM_VERSION

# Node 22 images bundle npm 10; keep tooling installs on the repository npm version.
RUN npm install --global "npm@${NPM_VERSION}" \
    && test "$(npm --version)" = "${NPM_VERSION}"

FROM base AS builder

WORKDIR /app

RUN npm install -g mint@4.2.13

COPY . .

# Install a local version of our OpenAPI spec
RUN apk add --no-cache wget jq && \
    wget -O spec.json https://app.infisical.com/api/docs/json && \
    jq '.api.openapi = "./spec.json"' docs.json > temp.json && \
    mv temp.json docs.json

# Run mint dev briefly to download the web client
RUN timeout 30 mint dev || true

FROM base

WORKDIR /app

RUN addgroup -g 1001 -S mintuser && \
    adduser -S -D -H -u 1001 -s /sbin/nologin -G mintuser mintuser && \
    npm install -g mint@4.2.13

COPY --chown=mintuser:mintuser . .

COPY --from=builder --chown=mintuser:mintuser /root/.mintlify /home/mintuser/.mintlify
COPY --from=builder --chown=mintuser:mintuser /app/docs.json /app/docs.json
COPY --from=builder --chown=mintuser:mintuser /app/spec.json /app/spec.json

USER mintuser

EXPOSE 3000

CMD ["mint", "dev"]
