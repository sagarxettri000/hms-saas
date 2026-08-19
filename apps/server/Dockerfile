FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/
RUN npm install

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build -w @hms/shared
RUN npx prisma generate --schema=apps/server/prisma/schema.prisma
RUN npm run build -w @hms/server

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/server/prisma ./apps/server/prisma
COPY --from=builder /app/apps/server/package.json ./apps/server/
RUN cd apps/server && npx prisma generate
RUN npm install -g tsx typescript

COPY apps/server/start.sh ./apps/server/start.sh
RUN chmod +x apps/server/start.sh

EXPOSE 4000
CMD ["sh", "apps/server/start.sh"]
