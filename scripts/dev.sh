#!/bin/bash

# Vibe Code Development Script
echo "🚀 Starting Vibe Code Development Environment"

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm is not installed. Please install it first:"
    echo "npm install -g pnpm"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Build shared packages first
echo "🔨 Building shared packages..."
pnpm --filter @vibecode/shared build
pnpm --filter @vibecode/adapter-sdk build

# Build adapters
echo "🔧 Building adapters..."
pnpm --filter @vibecode/adapter-* build

# Check if frontend dependencies are installed
if [ ! -d "packages/frontend/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd packages/frontend && pnpm install && cd ../..
fi

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
(cd packages/backend && pnpm dev) &

# Start frontend
echo "⚛️ Starting frontend server..."
(cd packages/frontend && pnpm dev) &

# Wait for all background processes
wait