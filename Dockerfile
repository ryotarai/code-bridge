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
RUN groupadd -r runner && useradd -r -g runner -m -d /home/runner runner

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

USER runner

# Set the default command to start the server
ENTRYPOINT ["node", "/app/dist/server/cli.js"]

######################################################################

FROM production AS runner

RUN apt-get update && apt-get install -y curl

WORKDIR /workspace

USER runner

# Set the default command to start the runner
ENTRYPOINT ["node", "/app/dist/runner/main.js"]
