FROM golang:1.27-trixie AS build

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=1 go build -o /out/infisical-api ./cmd/infisical

FROM debian:trixie-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build /out/infisical-api /usr/local/bin/infisical-api

EXPOSE 4040

ENTRYPOINT ["/usr/local/bin/infisical-api"]
