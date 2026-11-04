ARG INFISICAL_CLI_VERSION=0.44.12

# Required for pkcs11js and TDS driver (SAP ASE dynamic secrets). Shared by build and prod-deps.
FROM node:26.12.1-trixie-slim AS native-build

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    libc-dev \
    unixodbc-dev \
    freetds-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

FROM native-build AS build

RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .
RUN npm run build

# Production dependencies (runs in parallel with build). Type declarations, source maps and
# node-gyp object files are not read at runtime and are about 400 MB of node_modules. The test
# folders are ones these packages publish with sample private keys that image scanners flag.
FROM native-build AS prod-deps

RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev \
    && rm -rf node_modules/@fastify/reply-from/test node_modules/ssh2/test node_modules/universal-github-app-jwt/test \
    && find node_modules -type d \( -name obj.target -o -name .deps \) -path '*/build/*' -prune -exec rm -rf {} + \
    && find node_modules -type f \( -name '*.d.ts' -o -name '*.d.mts' -o -name '*.d.cts' -o -name '*.map' \) -delete

# Oracle Instant Client (parallel stage — downloads while other stages build)
FROM debian:trixie-slim AS oracle
RUN apt-get update && apt-get install -y --no-install-recommends unzip wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "amd64" ]; then \
        ORACLE_ZIP="instantclient-basic-linux.x64-23.26.0.0.0.zip" && \
        EXPECTED_SHA="d6c79cbcf0ff209363e779855c690d4fc730aed847e9198a2c439bcf34760af5"; \
    elif [ "$ARCH" = "arm64" ]; then \
        ORACLE_ZIP="instantclient-basic-linux.arm64-23.26.0.0.0.zip" && \
        EXPECTED_SHA="9c9a32051e97f087016fb334b7ad5c0aea8511ca8363afd8e0dc6ec4fc515c32"; \
    else \
        echo "Unsupported architecture: $ARCH" >&2 && exit 1; \
    fi && \
    ORACLE_URL="https://download.oracle.com/otn_software/linux/instantclient/2326000/${ORACLE_ZIP}" && \
    wget -q "$ORACLE_URL" && \
    echo "$EXPECTED_SHA  $ORACLE_ZIP" | sha256sum -c - && \
    mkdir -p /opt/oracle && \
    unzip -q "$ORACLE_ZIP" -d /opt/oracle && \
    rm "$ORACLE_ZIP"

# Production stage
FROM node:26.12.1-trixie-slim

WORKDIR /app

ENV npm_config_cache /home/node/.npm

# Only runtime dependencies, no compilation happens here. --no-install-recommends drops packages
# the server relies on, so they are listed: ca-certificates (git clones over HTTPS for secret
# scanning) and openssh-client (ssh-keygen for SSH dynamic secrets and certificates).
ARG INFISICAL_CLI_VERSION
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    openssh-client \
    netbase \
    unixodbc \
    libodbccr2 \
    freetds-bin \
    tdsodbc \
    libaio1t64 \
    smbclient \
    curl \
    git \
    && curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' | bash \
    && test -n "$INFISICAL_CLI_VERSION" \
    && apt-get update && apt-get install -y --no-install-recommends infisical="$INFISICAL_CLI_VERSION" \
    && rm -rf /var/lib/apt/lists/*

# The driver lives under the architecture's multiarch directory, so read its path from the package.
RUN TDS_DRIVER="$(dpkg -L tdsodbc | grep '/odbc/libtdsodbc\.so$')" \
    && test -f "$TDS_DRIVER" \
    && printf "[FreeTDS]\nDescription = FreeTDS Driver\nDriver = %s\nSetup = %s\nFileUsage = 1\n" "$TDS_DRIVER" "$TDS_DRIVER" > /etc/odbcinst.ini

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

# node_modules goes before dist so a source-only change rebuilds just the dist layer.
COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s \
    CMD curl -fsS "http://localhost:${PORT:-4000}/api/status" > /dev/null || exit 1

ENV HOST=0.0.0.0

EXPOSE 4000

CMD ["npm", "start"]
