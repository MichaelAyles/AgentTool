# Multi-stage build for Vibe Code Frontend
FROM oven/bun:1.0-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lock ./
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/shared/package.json ./packages/shared/

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY packages/frontend ./packages/frontend
COPY packages/shared ./packages/shared

# Build the frontend application
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL

RUN cd packages/frontend && bun run build

# Production stage with Nginx
FROM nginx:alpine AS production

# Install curl for health checks
RUN apk add --no-cache curl

# Copy custom nginx configuration
COPY packages/frontend/nginx.conf /etc/nginx/nginx.conf

# Copy built application
COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html

# Create non-root user for nginx
RUN addgroup -g 1001 -S nginx_group
RUN adduser -S nginx_user -u 1001 -G nginx_group

# Set proper permissions
RUN chown -R nginx_user:nginx_group /usr/share/nginx/html
RUN chown -R nginx_user:nginx_group /var/cache/nginx
RUN chown -R nginx_user:nginx_group /var/log/nginx
RUN chown -R nginx_user:nginx_group /etc/nginx/conf.d
RUN touch /var/run/nginx.pid
RUN chown -R nginx_user:nginx_group /var/run/nginx.pid

# Switch to non-root user
USER nginx_user

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:80 || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]