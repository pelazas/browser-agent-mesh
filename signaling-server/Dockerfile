FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install && npm cache clean --force

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

EXPOSE 4444

CMD ["node", "dist/server.js"]
