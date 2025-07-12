# Build stage
FROM node:24 AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code and configuration files
COPY . .

# Build the TypeScript project
RUN npm run build

######################################################################

# Production stage
FROM node:24 AS production

# Run as runner user
RUN groupadd -g 10000 -r runner && useradd -u 10000 -r -g runner -m -d /home/runner runner

# /workspace
RUN mkdir -p /app && chown runner:runner /app
RUN mkdir -p /workspace && chown runner:runner /workspace

# Install claude
RUN npm install -g @anthropic-ai/claude-code

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

######################################################################

FROM production AS server

# Expose the port (default from typical server setup)
EXPOSE 3000

USER 10000:10000

# Set the default command to start the server
ENTRYPOINT ["node", "/app/dist/server/cli.js"]

######################################################################

FROM production AS runner

RUN apt-get update && apt-get install -y curl

# Install GitHub CLI based on architecture
ARG TARGETARCH
RUN if [ "$TARGETARCH" = "arm64" ]; then \
        ARCH="arm64"; \
    else \
        ARCH="amd64"; \
    fi && \
    mkdir -p /tmp/gh && \   
    curl -L https://github.com/cli/cli/releases/download/v2.74.2/gh_2.74.2_linux_${ARCH}.tar.gz -o /tmp/gh/gh.tar.gz && \
    tar -xzf /tmp/gh/gh.tar.gz -C /tmp/gh && \
    mv /tmp/gh/gh_2.74.2_linux_${ARCH}/bin/gh /usr/local/bin/gh && \
    rm -rf /tmp/gh

WORKDIR /workspace

USER 10000:10000

# Set the default command to start the runner
ENTRYPOINT ["node", "/app/dist/runner/main.js"]
