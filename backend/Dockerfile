# Build stage
FROM node:16-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci --only-production

COPY . .
RUN npm run build

# Production stage
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only-production

COPY --from=build /app .

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s \  
  CMD node healthcheck.js

EXPOSE 4000

CMD ["npm", "run", "start"]