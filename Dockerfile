# Stage 1: Build dependencies dan kompilasi
FROM node:18-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Runner (Image produksi)
FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV PORT 8001

# Salin aset yang dibutuhkan dari stage builder
COPY --from=builder /app/next.config.mjs ./
# COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 8001

CMD ["npm", "run", "start"]
