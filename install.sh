#!/bin/bash

# Vibe Code Local Agent Installer
# This script sets up a local agent connection for the Vibe Code web platform

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
VIBE_CODE_DIR="$HOME/.vibe-code"
AGENT_REPO="https://github.com/your-org/vibe-code.git"
API_BASE_URL="${VIBE_CODE_API_URL:-https://vibecode.com}"
SESSION_ID="${1:-}"
INSTALL_LOG="$HOME/.vibe-code-install.log"

# Platform detection
OS="$(uname -s)"
ARCH="$(uname -m)"

log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1" | tee -a "$INSTALL_LOG"
}

success() {
    echo -e "${GREEN}✓${NC} $1" | tee -a "$INSTALL_LOG"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1" | tee -a "$INSTALL_LOG"
}

error() {
    echo -e "${RED}✗${NC} $1" | tee -a "$INSTALL_LOG"
    exit 1
}

check_requirements() {
    log "Checking system requirements..."
    
    # Check OS compatibility
    case "$OS" in
        "Linux"|"Darwin")
            success "Operating system: $OS"
            ;;
        "MINGW"*|"MSYS"*|"CYGWIN"*)
            success "Windows with Unix environment detected"
            ;;
        *)
            error "Unsupported operating system: $OS. Please use Linux, macOS, or Windows with WSL2."
            ;;
    esac
    
    # Check for basic tools
    for cmd in curl git; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            error "$cmd is required but not installed. Please install $cmd and try again."
        fi
    done
    
    success "Basic requirements met"
}

install_node() {
    if command -v node >/dev/null 2>&1; then
        NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -ge 18 ]; then
            success "Node.js $(node --version) is already installed"
            return
        else
            warn "Node.js version is too old ($(node --version)). Installing newer version..."
        fi
    fi
    
    log "Installing Node.js..."
    
    # Use Node Version Manager (nvm) for installation
    if ! command -v nvm >/dev/null 2>&1; then
        log "Installing Node Version Manager (nvm)..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    fi
    
    # Install and use latest LTS Node.js
    nvm install --lts
    nvm use --lts
    
    success "Node.js installed successfully"
}

install_bun() {
    if command -v bun >/dev/null 2>&1; then
        success "Bun $(bun --version) is already installed"
        return
    fi
    
    log "Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    
    # Source the shell profile to make bun available
    if [ -f "$HOME/.bashrc" ]; then
        source "$HOME/.bashrc"
    elif [ -f "$HOME/.zshrc" ]; then
        source "$HOME/.zshrc"
    fi
    
    # Add to PATH if not already there
    export PATH="$HOME/.bun/bin:$PATH"
    
    if command -v bun >/dev/null 2>&1; then
        success "Bun installed successfully"
    else
        error "Bun installation failed. Please install manually from https://bun.sh"
    fi
}

setup_agent_directory() {
    log "Setting up Vibe Code agent directory..."
    
    if [ -d "$VIBE_CODE_DIR" ]; then
        log "Updating existing installation..."
        cd "$VIBE_CODE_DIR"
        git pull origin main || warn "Failed to update repository"
    else
        log "Cloning Vibe Code repository..."
        git clone "$AGENT_REPO" "$VIBE_CODE_DIR"
        cd "$VIBE_CODE_DIR"
    fi
    
    success "Agent directory ready"
}

install_dependencies() {
    log "Installing agent dependencies..."
    cd "$VIBE_CODE_DIR"
    
    # Install dependencies with Bun
    if command -v bun >/dev/null 2>&1; then
        bun install
    else
        # Fallback to npm
        npm install
    fi
    
    success "Dependencies installed"
}

install_tunnel_service() {
    log "Setting up secure tunnel service..."
    
    # Check if ngrok is available
    if command -v ngrok >/dev/null 2>&1; then
        success "ngrok is already installed"
        return
    fi
    
    # Install ngrok
    case "$OS" in
        "Linux")
            case "$ARCH" in
                "x86_64")
                    NGROK_URL="https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz"
                    ;;
                "arm64"|"aarch64")
                    NGROK_URL="https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-arm64.tgz"
                    ;;
                *)
                    error "Unsupported architecture: $ARCH"
                    ;;
            esac
            ;;
        "Darwin")
            case "$ARCH" in
                "x86_64")
                    NGROK_URL="https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-darwin-amd64.zip"
                    ;;
                "arm64")
                    NGROK_URL="https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-darwin-arm64.zip"
                    ;;
                *)
                    error "Unsupported architecture: $ARCH"
                    ;;
            esac
            ;;
        *)
            warn "Automatic ngrok installation not supported for $OS. Please install ngrok manually."
            return
            ;;
    esac
    
    NGROK_DIR="$VIBE_CODE_DIR/bin"
    mkdir -p "$NGROK_DIR"
    
    log "Downloading ngrok..."
    if [[ "$NGROK_URL" == *.zip ]]; then
        curl -L -o "/tmp/ngrok.zip" "$NGROK_URL"
        unzip -q "/tmp/ngrok.zip" -d "$NGROK_DIR"
        rm "/tmp/ngrok.zip"
    else
        curl -L -o "/tmp/ngrok.tgz" "$NGROK_URL"
        tar -xzf "/tmp/ngrok.tgz" -C "$NGROK_DIR"
        rm "/tmp/ngrok.tgz"
    fi
    
    chmod +x "$NGROK_DIR/ngrok"
    export PATH="$NGROK_DIR:$PATH"
    
    success "ngrok installed"
}

validate_session_id() {
    if [ -z "$SESSION_ID" ]; then
        error "Session ID is required. Usage: $0 <session-id>"
    fi
    
    # Validate UUID format
    if ! echo "$SESSION_ID" | grep -qE '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'; then
        error "Invalid session ID format. Expected UUID format."
    fi
    
    success "Session ID validated: ${SESSION_ID:0:8}..."
}

build_local_agent() {
    log "Building local agent..."
    cd "$VIBE_CODE_DIR"
    
    # Build the local agent package
    if command -v bun >/dev/null 2>&1; then
        cd packages/local-agent
        bun install
        bun run build
        cd ../..
    else
        cd packages/local-agent
        npm install
        npm run build
        cd ../..
    fi
    
    success "Local agent built successfully"
}

start_tunnel() {
    log "Starting secure tunnel..."
    
    cd "$VIBE_CODE_DIR"
    
    # Start ngrok in the background
    if command -v ngrok >/dev/null 2>&1; then
        NGROK_CMD="ngrok"
    else
        NGROK_CMD="./bin/ngrok"
    fi
    
    # Start ngrok tunnel
    $NGROK_CMD http 3001 --log=stdout > ngrok.log 2>&1 &
    NGROK_PID=$!
    
    # Wait for ngrok to start and get the URL
    sleep 3
    
    # Extract tunnel URL from ngrok
    TUNNEL_URL=""
    for i in {1..10}; do
        if [ -f ngrok.log ]; then
            TUNNEL_URL=$(grep -o 'https://[^[:space:]]*\.ngrok-free\.app' ngrok.log | head -1)
            if [ -n "$TUNNEL_URL" ]; then
                break
            fi
        fi
        sleep 1
    done
    
    if [ -z "$TUNNEL_URL" ]; then
        # Try ngrok API
        TUNNEL_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o 'https://[^"]*\.ngrok-free\.app' | head -1)
    fi
    
    if [ -z "$TUNNEL_URL" ]; then
        error "Failed to establish tunnel. Please check ngrok installation."
    fi
    
    export TUNNEL_URL
    success "Tunnel established: $TUNNEL_URL"
}

start_agent() {
    log "Starting local agent..."
    cd "$VIBE_CODE_DIR"
    
    # Set environment variables
    export VIBE_CODE_SERVER_URL="$API_BASE_URL"
    export NGROK_TOKEN="${NGROK_TOKEN:-}"
    
    # Start the local agent using the CLI
    if command -v bun >/dev/null 2>&1; then
        bun run packages/local-agent/dist/cli.js connect "$SESSION_ID" --server "$API_BASE_URL" --port 3001 &
    else
        node packages/local-agent/dist/cli.js connect "$SESSION_ID" --server "$API_BASE_URL" --port 3001 &
    fi
    
    AGENT_PID=$!
    
    log "Local agent started with PID $AGENT_PID"
    log "Session ID: $SESSION_ID"
    log "Server URL: $API_BASE_URL"
    
    # Create a cleanup script
    cat > "$VIBE_CODE_DIR/cleanup.sh" << EOF
#!/bin/bash
echo "Cleaning up Vibe Code local agent..."
kill $AGENT_PID 2>/dev/null || true
echo "Cleanup complete"
EOF
    chmod +x "$VIBE_CODE_DIR/cleanup.sh"
    
    success "Local agent is running!"
    echo ""
    echo -e "${GREEN}🎉 Setup Complete!${NC}"
    echo ""
    echo "Your local machine is now connected to Vibe Code."
    echo "You can now use the web interface to interact with your local terminal."
    echo ""
    echo -e "${YELLOW}To stop the agent, run:${NC}"
    echo "  $VIBE_CODE_DIR/cleanup.sh"
    echo ""
    echo -e "${YELLOW}Logs are available at:${NC}"
    echo "  $INSTALL_LOG"
    echo ""
    
    # Keep the script running
    wait $AGENT_PID
}

cleanup_on_exit() {
    if [ -f "$VIBE_CODE_DIR/cleanup.sh" ]; then
        "$VIBE_CODE_DIR/cleanup.sh"
    fi
}

main() {
    # Setup signal handlers
    trap cleanup_on_exit EXIT INT TERM
    
    echo ""
    echo -e "${BLUE}🚀 Vibe Code Local Agent Installer${NC}"
    echo "=================================================="
    echo ""
    
    # Create log file
    mkdir -p "$(dirname "$INSTALL_LOG")"
    echo "Installation started at $(date)" > "$INSTALL_LOG"
    
    validate_session_id
    check_requirements
    install_node
    install_bun
    setup_agent_directory
    install_dependencies
    build_local_agent
    start_agent
}

# Run main function
main "$@"