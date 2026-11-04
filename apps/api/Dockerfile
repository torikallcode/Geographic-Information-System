FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm ci --workspace @gis/api --include-workspace-root

COPY apps/api apps/api

WORKDIR /app/apps/api

ENV NODE_ENV=production
EXPOSE 4000

CMD ["npx", "tsx", "src/index.ts"]
