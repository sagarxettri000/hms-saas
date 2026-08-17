FROM node:20-alpine AS base
RUN npm i -g pnpm@9
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --filter @hms/server... 2>/dev/null || pnpm install --filter @hms/server...

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
RUN npm run build -w @hms/shared
RUN npm run build -w @hms/server

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN npm i -g pnpm@9

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/server/prisma ./apps/server/prisma
COPY --from=builder /app/package.json ./
COPY --from=builder /app/apps/server/package.json ./apps/server/

EXPOSE 4000
CMD ["sh", "-c", "cd apps/server && npx prisma migrate deploy && node dist/main.js"]
