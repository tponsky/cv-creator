# Build stage
FROM node:20-alpine AS builder

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Ensure public folder exists
RUN mkdir -p public

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

# Install OpenSSL for Prisma runtime
RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma

# Copy full Prisma client including generated client and runtime
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Copy bcryptjs for password hashing
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs

# Copy jose for JWT authentication (replaces next-auth)
COPY --from=builder /app/node_modules/jose ./node_modules/jose

# Copy cookie for cookie serialization in Pages Router
COPY --from=builder /app/node_modules/cookie ./node_modules/cookie

# Set permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
