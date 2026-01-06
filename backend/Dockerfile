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

RUN npm ci --only-production && npm cache clean --force

COPY --from=build /app .


RUN apt-get install -y curl bash

# Install Infisical CLI
RUN curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' | bash && \
    apt-get update && apt-get install -y infisical=0.43.14 git

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s \
    CMD node healthcheck.js

ENV HOST=0.0.0.0

EXPOSE 4000

CMD ["npm", "start"]
