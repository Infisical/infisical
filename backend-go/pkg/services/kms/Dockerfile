# Build the KMS gRPC sidecar from the backend-go repository root.
FROM golang:1.27-trixie AS build

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=1 go build -o /out/kms ./pkg/services/kms/cmd/microservice

FROM debian:trixie-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build /out/kms /usr/local/bin/infisical-kms

EXPOSE 4040

ENTRYPOINT ["/usr/local/bin/infisical-kms"]
