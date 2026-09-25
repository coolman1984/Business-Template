# Same server image for cloud, on-premise machine and local network installs.
FROM node:22-bookworm-slim
WORKDIR /srv
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/api/package.json apps/api/
COPY packages/platform-core/package.json packages/platform-core/
COPY packages/engine-orders/package.json packages/engine-orders/
COPY packages/recipe-inventory-orders/package.json packages/recipe-inventory-orders/
COPY apps/business-web/package.json apps/business-web/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build:web
USER node
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["pnpm", "start"]
