#!/bin/bash

# AgentTool Setup Script
# Hierarchical Multi-Agent System for AI-Powered Development

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
REPO_URL="https://github.com/MichaelAyles/AgentTool"
REPO_NAME="AgentTool"
INSTALL_DIR="$HOME/.agenttool"
BIN_DIR="$HOME/.local/bin"

# Helper functions
print_header() {
    echo -e "${PURPLE}"
    echo "╭─────────────────────────────────────────────────────────────╮"
    echo "│                                                             │"
    echo "│                        AgentTool                            │"
    echo "│           Hierarchical Multi-Agent System                  │"
    echo "│                                                             │"
    echo "╰─────────────────────────────────────────────────────────────╯"
    echo -e "${NC}"
}

print_step() {
    echo -e "${CYAN}[STEP]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check system requirements
check_system() {
    print_step "Checking system requirements..."
    
    # Check OS
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
        OS="windows"
    else
        print_error "Unsupported operating system: $OSTYPE"
        exit 1
    fi
    
    print_info "Operating System: $OS"
    
    # Check architecture
    ARCH=$(uname -m)
    if [[ "$ARCH" == "x86_64" ]]; then
        ARCH="x64"
    elif [[ "$ARCH" == "arm64" ]] || [[ "$ARCH" == "aarch64" ]]; then
        ARCH="arm64"
    else
        print_warning "Architecture $ARCH may not be supported"
    fi
    
    print_info "Architecture: $ARCH"
}

# Install dependencies
install_dependencies() {
    print_step "Installing dependencies..."
    
    # Check and install Git
    if ! command_exists git; then
        print_info "Installing Git..."
        case $OS in
            "linux")
                if command_exists apt-get; then
                    sudo apt-get update && sudo apt-get install -y git
                elif command_exists yum; then
                    sudo yum install -y git
                elif command_exists pacman; then
                    sudo pacman -S --noconfirm git
                else
                    print_error "Cannot install Git automatically. Please install Git manually."
                    exit 1
                fi
                ;;
            "macos")
                if command_exists brew; then
                    brew install git
                else
                    print_error "Homebrew not found. Please install Git manually or install Homebrew first."
                    exit 1
                fi
                ;;
        esac
    else
        print_success "Git is already installed"
    fi
    
    # Check and install Node.js
    if ! command_exists node; then
        print_info "Installing Node.js..."
        if command_exists curl; then
            curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
            case $OS in
                "linux")
                    if command_exists apt-get; then
                        sudo apt-get install -y nodejs
                    elif command_exists yum; then
                        sudo yum install -y nodejs npm
                    fi
                    ;;
                "macos")
                    if command_exists brew; then
                        brew install node
                    fi
                    ;;
            esac
        else
            print_error "curl not found. Please install Node.js manually."
            exit 1
        fi
    else
        print_success "Node.js is already installed"
    fi
    
    # Check and install Rust
    if ! command_exists rustc; then
        print_info "Installing Rust..."
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        source "$HOME/.cargo/env"
    else
        print_success "Rust is already installed"
    fi
}

# Download and install AgentTool
install_agenttool() {
    print_step "Downloading AgentTool..."
    
    # Create installation directory
    mkdir -p "$INSTALL_DIR"
    mkdir -p "$BIN_DIR"
    
    # Clone repository
    if [ -d "$INSTALL_DIR/AgentTool" ]; then
        print_info "AgentTool already exists, updating..."
        cd "$INSTALL_DIR/AgentTool"
        git pull origin main
    else
        cd "$INSTALL_DIR"
        git clone "$REPO_URL" AgentTool
        cd AgentTool
    fi
    
    print_step "Building AgentTool..."
    
    # Build Rust backend
    cd src-tauri
    cargo build --release
    
    # Build frontend
    cd ../frontend
    if [ -f "package.json" ]; then
        npm install
        npm run build
    fi
    
    # Copy binary to bin directory
    cd ../src-tauri
    cp target/release/agenttool "$BIN_DIR/"
    chmod +x "$BIN_DIR/agenttool"
    
    print_success "AgentTool built successfully!"
}

# Setup PATH
setup_path() {
    print_step "Setting up PATH..."
    
    # Add to PATH if not already present
    if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
        # Detect shell
        if [[ -n "$ZSH_VERSION" ]]; then
            SHELL_CONFIG="$HOME/.zshrc"
        elif [[ -n "$BASH_VERSION" ]]; then
            SHELL_CONFIG="$HOME/.bashrc"
        else
            SHELL_CONFIG="$HOME/.profile"
        fi
        
        echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$SHELL_CONFIG"
        print_info "Added $BIN_DIR to PATH in $SHELL_CONFIG"
        print_warning "Please restart your shell or run: source $SHELL_CONFIG"
    else
        print_success "PATH is already configured"
    fi
}

# Setup configuration
setup_config() {
    print_step "Setting up configuration..."
    
    CONFIG_DIR="$HOME/.config/agenttool"
    mkdir -p "$CONFIG_DIR"
    
    # Create default config if it doesn't exist
    if [ ! -f "$CONFIG_DIR/config.json" ]; then
        cat > "$CONFIG_DIR/config.json" << EOF
{
  "version": "1.0.0",
  "agents": {
    "claude_code": {
      "enabled": true,
      "executable_path": "claude-code",
      "permissions": {
        "file_read": true,
        "file_write": true,
        "network_access": true,
        "process_spawn": true
      }
    },
    "gemini_cli": {
      "enabled": true,
      "executable_path": "gemini",
      "permissions": {
        "file_read": true,
        "file_write": false,
        "network_access": true,
        "process_spawn": false
      }
    }
  },
  "middle_manager": {
    "default_model": "anthropic/claude-3-sonnet",
    "openrouter_api_key": ""
  },
  "worktree": {
    "base_directory": "$HOME/.agenttool/worktrees"
  }
}
EOF
        print_success "Created default configuration"
    else
        print_success "Configuration already exists"
    fi
}

# Print completion message
print_completion() {
    echo -e "${GREEN}"
    echo "╭─────────────────────────────────────────────────────────────╮"
    echo "│                    Installation Complete!                  │"
    echo "╰─────────────────────────────────────────────────────────────╯"
    echo -e "${NC}"
    
    echo -e "${CYAN}Next steps:${NC}"
    echo "1. Restart your shell or run: source ~/.bashrc (or ~/.zshrc)"
    echo "2. Configure your API keys in: ~/.config/agenttool/config.json"
    echo "3. Install Claude Code: https://claude.ai/code"
    echo "4. Install Gemini CLI: https://ai.google.dev/gemini-api/docs/cli"
    echo "5. Run AgentTool: agenttool"
    echo ""
    echo -e "${PURPLE}Documentation:${NC} https://github.com/MichaelAyles/AgentTool"
    echo -e "${PURPLE}Issues:${NC} https://github.com/MichaelAyles/AgentTool/issues"
    echo ""
    echo -e "${YELLOW}Happy coding with AI agents! 🤖${NC}"
}

# Main installation flow
main() {
    print_header
    
    # Check if running as root
    if [[ $EUID -eq 0 ]]; then
        print_error "This script should not be run as root"
        exit 1
    fi
    
    check_system
    install_dependencies
    install_agenttool
    setup_path
    setup_config
    print_completion
}

# Run main function
main "$@"