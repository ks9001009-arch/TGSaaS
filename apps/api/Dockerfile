# ---------- build stage ----------
# node:20-slim (Debian bookworm) avoids the fragile musl/OpenSSL engine loading
# that Alpine causes for Prisma ("Could not parse schema engine response").
FROM node:20-slim AS builder
WORKDIR /app

# Prisma engines need OpenSSL + CA certs
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install

COPY . .
RUN npx prisma generate
RUN npm run build
# compile the seed script separately (kept outside src/)
RUN npx tsc prisma/seed.ts --outDir dist/prisma --rootDir prisma \
    --module commonjs --target ES2021 --esModuleInterop --skipLibCheck || true

# ---------- runtime stage ----------
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# OpenSSL is required at runtime so the Prisma schema/query engines can load
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Carry the full, already-installed node_modules so the Prisma CLI (used by the
# entrypoint for db push) and the generated engines stay consistent.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]
