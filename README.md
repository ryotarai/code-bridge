# Code Bridge

A Slack bot built with Slack Bolt framework, Node.js and TypeScript.

## Features

- ⚡ **Slack Bolt Framework**: Official Slack framework for robust apps
- 🎯 **App Mentions Only**: Responds specifically to @mentions  
- ✅ **Socket Mode**: No need for public URLs or webhooks
- ✅ **TypeScript**: Full type safety and modern ES modules
- ✅ **CLI Interface**: Easy-to-use command-line interface
- ✅ **Graceful Shutdown**: Proper cleanup on exit
- ✅ **Development Tools**: ESLint, Prettier, and hot reload

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up your Slack app:**
   - Create a new Slack app at https://api.slack.com/apps
   - Enable Socket Mode in your app settings  
   - Get your App-Level Token (starts with `xapp-`) - needed for Socket Mode
   - Get your Bot User OAuth Token (starts with `xoxb-`)
   - Get your Signing Secret from Basic Information

3. **Create environment file:**
   ```bash
   cp .env.example .env
   # Edit .env with your actual tokens
   ```

## Usage

### Start the server
```bash
# Development mode
npm run dev:server start

# Production mode
npm run build
npm run server start
```

### Available Commands
```bash
# Start Slack socket server
code-bridge start

# Show version information  
code-bridge version

# Example command for testing
code-bridge example
```

## Bot Interactions

- **App Mentions Only**: Mention the bot (`@YourBot`) → Bot responds with a personalized greeting
- **Threaded Responses**: Bot replies in thread to keep conversations organized

## Environment Variables

- `SLACK_APP_TOKEN` - Your Slack app's App-Level Token for Socket Mode (required)
- `SLACK_BOT_TOKEN` - Your Slack app's Bot User OAuth Token (required)  
- `SLACK_SIGNING_SECRET` - Your Slack app's Signing Secret (required)
- `NODE_ENV` - Environment (development/production)

## Development Scripts

```bash
npm run dev:server     # Run server in development mode
npm run build          # Build TypeScript to dist/
npm run server         # Run built server CLI
npm run lint           # ESLint
npm run format         # Prettier
npm run typecheck      # TypeScript type checking
```

## Project Structure

```
src/
├── server/
│   ├── cli.ts           # Server CLI entry point
│   ├── slack-server.ts  # Slack Bolt app implementation
│   ├── index.ts         # Utilities (logger, etc.)
│   └── commands/
│       └── example.ts   # Example command
├── runner/              # Future: task runner
└── shared/              # Shared utilities
```