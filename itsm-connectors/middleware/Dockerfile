# Copyright (c) 2026 Esper.io — MIT License
FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
# npm ci requires a lockfile. For a sample repo, prefer npm install so
# cloning the repo "just works" even before a lockfile exists.
RUN npm install --omit=dev

COPY src/ ./src/

EXPOSE 3000

USER node

CMD ["node", "src/server.js"]
