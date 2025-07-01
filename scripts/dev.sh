#!/bin/bash

# Vibe Code Development Script
echo "🚀 Starting Vibe Code Development Environment"

# Check if bun is installed
if ! command -v bun &> /dev/null; then
    echo "❌ Bun is not installed. Please install it first:"
    echo "curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
bun install

# Build shared packages first
echo "🔨 Building shared packages..."
bun run --filter @vibecode/shared build
bun run --filter @vibecode/adapter-sdk build

# Build adapters
echo "🔧 Building adapters..."
bun run --filter @vibecode/adapter-* build

# Start services in parallel
echo "🌟 Starting development servers..."

# Function to kill all background processes
cleanup() {
    echo "🛑 Shutting down development servers..."
    jobs -p | xargs -r kill
    exit 0
}

trap cleanup SIGINT

# Start backend
echo "🔥 Starting backend server..."
(cd packages/backend && bun dev) &

# Start frontend
echo "⚛️ Starting frontend server..."
(cd packages/frontend && bun dev) &

# Wait for all background processes
wait