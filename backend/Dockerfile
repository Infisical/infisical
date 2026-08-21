ARG NPM_VERSION=11.19.0

FROM node:22.23.2-trixie-slim AS base
ARG NPM_VERSION

# Node 22 images bundle npm 10, but npm 11 enforces the repository's install policy.
RUN npm install --global "npm@${NPM_VERSION}" \
    && test "$(npm --version)" = "${NPM_VERSION}"

# Build stage
FROM base AS build

WORKDIR /app

# Required for pkcs11js and TDS driver (SAP ASE dynamic secrets)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    openssh-client \
    openssl \
    unixodbc \
    freetds-bin \
    freetds-dev \
    unixodbc-dev \
    libc-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json .npmrc ./
RUN npm_config_build_from_source=odbc npm ci

COPY . .
RUN npm run build

# Oracle Instant Client (parallel stage — downloads while other stages build)
FROM debian:trixie-slim AS oracle
RUN apt-get update && apt-get install -y unzip wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "amd64" ]; then \
        ORACLE_ZIP="instantclient-basic-linux.x64-23.26.0.0.0.zip" && \
        EXPECTED_SHA="d6c79cbcf0ff209363e779855c690d4fc730aed847e9198a2c439bcf34760af5"; \
    elif [ "$ARCH" = "arm64" ]; then \
        ORACLE_ZIP="instantclient-basic-linux.arm64-23.26.0.0.0.zip" && \
        EXPECTED_SHA="9c9a32051e97f087016fb334b7ad5c0aea8511ca8363afd8e0dc6ec4fc515c32"; \
    fi && \
    ORACLE_URL="https://download.oracle.com/otn_software/linux/instantclient/2326000/${ORACLE_ZIP}" && \
    wget -q "$ORACLE_URL" && \
    echo "$EXPECTED_SHA  $ORACLE_ZIP" | sha256sum -c - && \
    mkdir -p /opt/oracle && \
    unzip "$ORACLE_ZIP" -d /opt/oracle && \
    rm "$ORACLE_ZIP"

# Production dependencies (runs in parallel with build)
FROM base AS prod-deps

WORKDIR /app

# Build tools needed to compile native modules during npm ci
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    unixodbc \
    freetds-bin \
    freetds-dev \
    unixodbc-dev \
    libc-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json .npmrc ./
RUN npm_config_build_from_source=odbc npm ci --omit=dev

# Production stage
FROM base
WORKDIR /app

ENV npm_config_cache /home/node/.npm

# Only runtime dependencies — no compilation happens here
RUN apt-get update && apt-get install -y \
    unixodbc \
    freetds-bin \
    tdsodbc \
    libaio1t64 \
    smbclient \
    curl \
    bash \
    git \
    && curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' | bash \
    && apt-get update && apt-get install -y infisical=0.43.79 \
    && rm -rf /var/lib/apt/lists/*

RUN test -f /usr/share/tdsodbc/odbcinst.ini \
    && odbcinst -i -d -f /usr/share/tdsodbc/odbcinst.ini \
    && odbcinst -q -d -n FreeTDS \
    && test -f "$(dpkg -L tdsodbc | grep '/libtdsodbc\.so$')"

# Copy Oracle Instant Client from parallel stage
COPY --from=oracle /opt/oracle /opt/oracle
RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "amd64" ]; then \
        ln -sf /lib/x86_64-linux-gnu/libaio.so.1t64 /lib/x86_64-linux-gnu/libaio.so.1; \
    elif [ "$ARCH" = "arm64" ]; then \
        ln -sf /lib/aarch64-linux-gnu/libaio.so.1t64 /lib/aarch64-linux-gnu/libaio.so.1; \
    fi && \
    echo /opt/oracle/instantclient_23_26 > /etc/ld.so.conf.d/oracle-instantclient.conf && \
    ldconfig

COPY --from=build /app .
RUN rm -rf ./node_modules ./bdd ./e2e-test
COPY --from=prod-deps /app/node_modules ./node_modules

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s \
    CMD node healthcheck.js

ENV HOST=0.0.0.0

EXPOSE 4000

CMD ["npm", "start"]
