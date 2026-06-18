# Multi-stage build for smaller final image
# Stage 1: Build stage
FROM node:20-slim AS builder
 
# Install build dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
 
# Set the working directory in the container
# Set the working directory
WORKDIR /app

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
 
 
# Copy package files first for better layer caching
COPY package*.json ./
COPY .puppeteerrc.cjs ./
COPY scripts/install-puppeteer-browser.js ./scripts/install-puppeteer-browser.js
 
# Install all dependencies (including devDependencies for build)
RUN npm ci
 
# Copy the rest of your application's source code
# Copy source code
COPY . .
 

 
 
# Build the application
RUN npm run build

# Keep optional runtime asset copy steps stable even when source assets were removed.
RUN mkdir -p templates

# Stage 2: Production stage

 

# Stage 2: Production stage
FROM node:20-slim AS production
 
 
# Install runtime dependencies: Chromium for browser automation
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    --no-install-recommends && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
 
 
# Set the working directory
WORKDIR /app
 
# Copy package files
COPY package*.json ./
COPY .puppeteerrc.cjs ./
COPY scripts/install-puppeteer-browser.js ./scripts/install-puppeteer-browser.js
 
# Install only production dependencies
RUN npm ci --omit=dev && \
    npm cache clean --force
 
# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
# Create uploads directory and non-root user for security
RUN mkdir -p /app/uploads && \
    groupadd -r appuser && useradd -r -g appuser appuser && \
    chown -R appuser:appuser /app
 
USER appuser
 
# Expose the port
EXPOSE 5800
 
# Start the application
CMD [ "node", "dist/local.js" ]
