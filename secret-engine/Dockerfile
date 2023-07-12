FROM node:18-slim
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN npm ci --production
RUN npm cache clean --force
ENV NODE_ENV="production"
COPY . .

RUN apt-get update && apt-get install -y bash curl && curl -1sLf \
  'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | bash \
  && apt-get update && apt-get install -y infisical=0.8.1

RUN npm run build

CMD [ "npm", "run", "start:prod" ]
