FROM node:16-bullseye-slim

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --only-production

COPY . .

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s \  
    CMD node healthcheck.js


CMD ["npm", "run", "start"]
