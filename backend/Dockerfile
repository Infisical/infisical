# Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Required for pkcs11js
RUN apk --update add \
        python3 \
        make \
        g++ \
        openssh

# install dependencies for TDS driver (required for SAP ASE dynamic secrets)
RUN apk add --no-cache \
    unixodbc \
    freetds \
    unixodbc-dev \
    libc-dev \
    freetds-dev


COPY package*.json ./
RUN npm ci --only-production

COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app

ENV npm_config_cache /home/node/.npm

COPY package*.json ./

RUN apk --update add \
        python3 \
        make \
        g++

# install dependencies for TDS driver (required for SAP ASE dynamic secrets)
RUN apk add --no-cache \
    unixodbc \
    freetds \
    unixodbc-dev \
    libc-dev \
    freetds-dev


RUN printf "[FreeTDS]\nDescription = FreeTDS Driver\nDriver = /usr/lib/libtdsodbc.so\nSetup = /usr/lib/libtdsodbc.so\nFileUsage = 1\n" > /etc/odbcinst.ini

RUN npm ci --only-production && npm cache clean --force

COPY --from=build /app .

RUN apk add --no-cache bash curl && curl -1sLf \
  'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.alpine.sh' | bash \
  && apk add infisical=0.8.1 && apk add --no-cache git

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s \  
  CMD node healthcheck.js

ENV HOST=0.0.0.0

EXPOSE 4000

CMD ["npm", "start"]
