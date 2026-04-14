# Build stage
FROM node:22.22.0-trixie-slim AS build

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

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production dependencies (runs in parallel with build)
FROM node:22.22.0-trixie-slim AS prod-deps

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

COPY package*.json ./
RUN npm ci --omit=dev

# Production stage
FROM node:22.22.0-trixie-slim
WORKDIR /app

ENV npm_config_cache /home/node/.npm

# Only runtime dependencies — no compilation happens here
RUN apt-get update && apt-get install -y \
    unixodbc \
    freetds-bin \
    libaio1t64 \
    unzip \
    wget \
    && rm -rf /var/lib/apt/lists/*

RUN printf "[FreeTDS]\nDescription = FreeTDS Driver\nDriver = /usr/lib/x86_64-linux-gnu/odbc/libtdsodbc.so\nSetup = /usr/lib/x86_64-linux-gnu/odbc/libtdsodbc.so\nFileUsage = 1\n" > /etc/odbcinst.ini

# Install Oracle Instant Client for OracleDB mTLS wallet support
RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "amd64" ]; then \
        ORACLE_ZIP="instantclient-basic-linux.x64-23.26.0.0.0.zip" && \
        ORACLE_URL="https://download.oracle.com/otn_software/linux/instantclient/2326000/${ORACLE_ZIP}" && \
        EXPECTED_SHA="d6c79cbcf0ff209363e779855c690d4fc730aed847e9198a2c439bcf34760af5" && \
        ln -sf /lib/x86_64-linux-gnu/libaio.so.1t64 /lib/x86_64-linux-gnu/libaio.so.1 && \
        wget -q "$ORACLE_URL" && \
        echo "$EXPECTED_SHA  $ORACLE_ZIP" | sha256sum -c - && \
        unzip "$ORACLE_ZIP" -d /opt/oracle && \
        rm "$ORACLE_ZIP"; \
    elif [ "$ARCH" = "arm64" ]; then \
        ORACLE_ZIP="instantclient-basic-linux.arm64-23.26.0.0.0.zip" && \
        ORACLE_URL="https://download.oracle.com/otn_software/linux/instantclient/2326000/${ORACLE_ZIP}" && \
        EXPECTED_SHA="9c9a32051e97f087016fb334b7ad5c0aea8511ca8363afd8e0dc6ec4fc515c32" && \
        ln -sf /lib/aarch64-linux-gnu/libaio.so.1t64 /lib/aarch64-linux-gnu/libaio.so.1 && \
        wget -q "$ORACLE_URL" && \
        echo "$EXPECTED_SHA  $ORACLE_ZIP" | sha256sum -c - && \
        unzip "$ORACLE_ZIP" -d /opt/oracle && \
        rm "$ORACLE_ZIP"; \
    fi && \
    echo /opt/oracle/instantclient_23_26 > /etc/ld.so.conf.d/oracle-instantclient.conf && \
    ldconfig

COPY --from=build /app .
RUN rm -rf ./node_modules ./bdd ./e2e-test
COPY --from=prod-deps /app/node_modules ./node_modules

# Install smbclient for Windows SMB operations
RUN apt-get update && apt-get install -y smbclient

# Install Infisical CLI
RUN apt-get update && apt-get install -y curl bash && \
    curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' | bash && \
    apt-get update && apt-get install -y infisical=0.43.14 git

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s \
    CMD node healthcheck.js

ENV HOST=0.0.0.0

EXPOSE 4000

CMD ["npm", "start"]
