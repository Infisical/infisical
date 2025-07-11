FROM node:20-alpine AS builder

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

FROM node:20-alpine

WORKDIR /app

RUN npm install -g mint@4.2.13

COPY . .

COPY --from=builder /root/.mintlify /root/.mintlify
COPY --from=builder /app/docs.json /app/docs.json
COPY --from=builder /app/spec.json /app/spec.json

EXPOSE 3000

CMD ["mint", "dev"]
