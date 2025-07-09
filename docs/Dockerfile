FROM node:20-alpine
WORKDIR /app
RUN npm install -g mint
COPY . .
EXPOSE 3000
CMD ["mint", "dev"]
