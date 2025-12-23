# Build stage
FROM node:20.19.5-trixie-slim AS build

WORKDIR /app

# Required for pkcs11js
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    openssh-client \
    openssl

# Install dependencies for TDS driver (required for SAP ASE dynamic secrets)
RUN apt-get install -y \
    unixodbc \
    freetds-bin \
    freetds-dev \
    unixodbc-dev \
    libc-dev

COPY package*.json ./
RUN npm ci --only-production

COPY . .
RUN npm run build

# Production stage
FROM node:20.19.5-trixie-slim
WORKDIR /app

ENV npm_config_cache /home/node/.npm

COPY package*.json ./

RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++

# Install dependencies for TDS driver (required for SAP ASE dynamic secrets)
RUN apt-get install -y \
    unixodbc \
    freetds-bin \
    freetds-dev \
    unixodbc-dev \
    libc-dev

RUN printf "[FreeTDS]\nDescription = FreeTDS Driver\nDriver = /usr/lib/x86_64-linux-gnu/odbc/libtdsodbc.so\nSetup = /usr/lib/x86_64-linux-gnu/odbc/libtdsodbc.so\nFileUsage = 1\n" > /etc/odbcinst.ini

# Install Oracle Instant Client for OracleDB mTLS wallet support
RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "amd64" ]; then \
        apt-get update && apt-get install -y libaio1 unzip wget && \
        wget -q https://download.oracle.com/otn_software/linux/instantclient/2326000/instantclient-basic-linux.x64-23.26.0.0.0.zip && \
        unzip instantclient-basic-linux.x64-23.26.0.0.0.zip -d /opt/oracle && \
        rm instantclient-basic-linux.x64-23.26.0.0.0.zip; \
    elif [ "$ARCH" = "arm64" ]; then \
        apt-get update && apt-get install -y libaio1t64 unzip wget && \
        ln -sf /lib/aarch64-linux-gnu/libaio.so.1t64 /lib/aarch64-linux-gnu/libaio.so.1 && \
        wget -q https://download.oracle.com/otn_software/linux/instantclient/2326000/instantclient-basic-linux.arm64-23.26.0.0.0.zip && \
        unzip instantclient-basic-linux.arm64-23.26.0.0.0.zip -d /opt/oracle && \
        rm instantclient-basic-linux.arm64-23.26.0.0.0.zip; \
    fi && \
    echo /opt/oracle/instantclient_23_26 > /etc/ld.so.conf.d/oracle-instantclient.conf && \
    ldconfig && \
    rm -rf /var/lib/apt/lists/*

RUN npm ci --only-production && npm cache clean --force

COPY --from=build /app .

# Install Infisical CLI
RUN apt-get install -y curl bash && \
    curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' | bash && \
    apt-get update && apt-get install -y infisical=0.43.14 git

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s \
    CMD node healthcheck.js

ENV HOST=0.0.0.0

EXPOSE 4000

CMD ["npm", "start"]
