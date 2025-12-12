# Multi-stage build for NestJS backend
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies needed for build)
RUN npm ci && \
    npm cache clean --force

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine

# Install dumb-init, openssl, and wget for proper signal handling, SSL certificates, and health checks
RUN apk add --no-cache dumb-init openssl wget

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application from builder
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Copy SSL certificate generation script
COPY --chown=nodejs:nodejs scripts/generate-ssl-cert.sh ./scripts/

# Make script executable
RUN chmod +x ./scripts/generate-ssl-cert.sh

# Create SSL directory with correct permissions
RUN mkdir -p /app/ssl && chown -R nodejs:nodejs /app/ssl

# Switch to non-root user
USER nodejs

# Expose ports
EXPOSE 3000 443

# Health check (checks both HTTP and HTTPS if enabled)
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "const module = process.env.HTTPS_ENABLED === 'true' ? require('https') : require('http'); const port = process.env.PORT || 3000; module.get({hostname: 'localhost', port: port, path: '/health', rejectUnauthorized: false}, (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application (generate SSL certs first if HTTPS is enabled)
CMD sh -c "./scripts/generate-ssl-cert.sh && node dist/src/main"
