#!/bin/bash

# Vibe Coding Desktop Connector Installation Script
# Usage: curl -fsSL https://raw.githubusercontent.com/MichaelAyles/AgentTool/main/install.sh | bash -s <uuid>

set -e

UUID="$1"
INSTALL_DIR="$HOME/.vibe-coding"
CONNECTOR_DIR="$INSTALL_DIR/connector"
REPO_URL="https://github.com/MichaelAyles/AgentTool.git"
BRANCH="main"

echo "🚀 Installing Vibe Coding Desktop Connector..."
echo "=================================="

# Validate UUID parameter
if [ -z "$UUID" ]; then
    echo "❌ Error: UUID parameter required"
    echo "Usage: curl -fsSL https://raw.githubusercontent.com/MichaelAyles/AgentTool/main/install.sh | bash -s <uuid>"
    exit 1
fi

# Validate UUID format
if ! echo "$UUID" | grep -qE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; then
    echo "❌ Error: Invalid UUID format"
    echo "Expected format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    exit 1
fi

echo "📋 UUID: $UUID"
echo "📁 Install Directory: $INSTALL_DIR"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed"
    echo "Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2)
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'.' -f1)

if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "❌ Error: Node.js version $NODE_VERSION is too old"
    echo "Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js version: $NODE_VERSION"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm is not installed"
    exit 1
fi

echo "✅ npm version: $(npm --version)"

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Error: git is not installed"
    echo "Please install git from https://git-scm.com/"
    exit 1
fi

echo "✅ git version: $(git --version | cut -d' ' -f3)"
echo ""

# Create installation directory
echo "📁 Creating installation directory..."
mkdir -p "$INSTALL_DIR"

# Check if connector is already installed
if [ -d "$CONNECTOR_DIR" ]; then
    echo "🔄 Existing installation found. Updating..."
    cd "$CONNECTOR_DIR"
    git pull origin "$BRANCH"
else
    echo "📥 Cloning repository..."
    git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$CONNECTOR_DIR"
    cd "$CONNECTOR_DIR"
fi

# Navigate to connector directory
cd "$CONNECTOR_DIR/connector"

echo "📦 Installing dependencies..."
npm install --production

echo "🔨 Building connector..."
npm run build

# Create symlink for global access
SYMLINK_PATH="/usr/local/bin/vibe-connector"
if [ -w "/usr/local/bin" ]; then
    echo "🔗 Creating global symlink..."
    ln -sf "$CONNECTOR_DIR/connector/dist/cli.js" "$SYMLINK_PATH"
    chmod +x "$SYMLINK_PATH"
    echo "✅ Global command 'vibe-connector' created"
else
    echo "⚠️  Cannot create global symlink (permission denied)"
    echo "   You can run the connector with: $CONNECTOR_DIR/connector/dist/cli.js"
fi

echo ""
echo "🎉 Installation completed successfully!"
echo "=================================="
echo ""
echo "🚀 Starting connector with UUID: $UUID"
echo ""

# Start the connector with the provided UUID
cd "$CONNECTOR_DIR/connector"
exec node dist/index.js