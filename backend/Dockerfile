FROM node:16-bullseye-slim AS build

WORKDIR /app
COPY package*.json ./

RUN npm ci --only-production --ignore-scripts

COPY . .

RUN npm run build



FROM node:16-bullseye-slim

WORKDIR /app
COPY package*.json ./

RUN npm ci --only-production

COPY --from=build /app .

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s \  
  CMD node healthcheck.js

EXPOSE 4000

CMD ["npm", "run", "start"]
