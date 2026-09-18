# Base image for running Go integration tests that require SoftHSM2.
# Used by testcontainers to run HSM tests inside a container.

FROM golang:1.26-alpine

RUN apk add --no-cache \
    softhsm \
    opensc \
    git \
    gcc \
    musl-dev \
    && mkdir -p /var/lib/softhsm/tokens

# Set default SoftHSM2 library path for tests
ENV SOFTHSM2_LIB=/usr/lib/softhsm/libsofthsm2.so

WORKDIR /app

# Keep container running for exec commands
CMD ["tail", "-f", "/dev/null"]
