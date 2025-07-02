# Code Bridge CLI

A modern Node.js + TypeScript CLI project setup for 2025.

## Features

- ✅ TypeScript with modern ESNext configuration
- ✅ ESM modules support
- ✅ Commander.js for CLI commands
- ✅ Chalk for colored output
- ✅ ESLint + Prettier for code quality
- ✅ Development and build scripts
- ✅ Proper bin configuration for global installation

## Quick Start

```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Build for production
npm run build

# Run built CLI
npm start
```

## Available Commands

```bash
# Basic commands
code-bridge hello --name "Developer"
code-bridge status
code-bridge example --verbose --file input.txt --output output.txt
```

## Development Scripts

```bash
npm run dev        # Run in development mode with tsx
npm run watch      # Watch mode with nodemon
npm run build      # Build TypeScript to dist/
npm run start      # Run built CLI
npm run lint       # ESLint
npm run format     # Prettier
npm run typecheck  # TypeScript type checking
```

## Project Structure

```
src/
├── cli.ts              # Main CLI entry point
├── index.ts            # Exported utilities
└── commands/
    └── example.ts      # Example command module
```

## Installation

```bash
# Local development
npm link

# Global installation (after publishing)
npm install -g code-bridge
```