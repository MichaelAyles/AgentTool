# Multi-stage build for Vibe Code Backend
FROM oven/bun:1.0-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lock ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/shared/package.json ./packages/shared/
COPY packages/adapter-sdk/package.json ./packages/adapter-sdk/

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY packages/backend ./packages/backend
COPY packages/shared ./packages/shared
COPY packages/adapter-sdk ./packages/adapter-sdk
COPY adapters ./adapters

# Build the application
RUN cd packages/backend && bun run build

# Production stage
FROM node:18-alpine AS production

# Install system dependencies
RUN apk add --no-cache \
    git \
    curl \
    bash \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S backend -u 1001

# Set working directory
WORKDIR /app

# Copy package files and install production dependencies
COPY package.json bun.lock ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/shared/package.json ./packages/shared/
COPY packages/adapter-sdk/package.json ./packages/adapter-sdk/

# Install bun for production
RUN npm install -g bun

# Install production dependencies
RUN bun install --frozen-lockfile --production

# Copy built application
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/adapter-sdk/dist ./packages/adapter-sdk/dist
COPY --from=builder /app/adapters ./adapters

# Create necessary directories
RUN mkdir -p /app/.config /app/.tmp /app/logs
RUN chown -R backend:nodejs /app

# Switch to non-root user
USER backend

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Start the application
CMD ["bun", "run", "packages/backend/dist/index.js"]