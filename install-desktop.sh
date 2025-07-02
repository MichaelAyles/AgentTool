#!/bin/bash

# Vibe Code Desktop Connector Installer
# Universal installer for macOS, Linux, and WSL2

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
REPO_URL="https://github.com/your-org/vibe-code.git"
INSTALL_DIR="$HOME/.vibe-code"
BINARY_NAME="vibe-code-desktop"
DESKTOP_CONNECTOR_PORT=3000

# Function to print colored output
print_color() {
    printf "${1}${2}${NC}\n"
}

print_header() {
    echo ""
    print_color $CYAN "╭─────────────────────────────────────────────────────────────╮"
    print_color $CYAN "│                     VIBE CODE                                │"
    print_color $CYAN "│                 Desktop Connector                            │"
    print_color $CYAN "│                                                             │"
    print_color $CYAN "│  Universal AI Coding Assistant Platform                     │"
    print_color $CYAN "╰─────────────────────────────────────────────────────────────╯"
    echo ""
}

print_step() {
    print_color $BLUE "▶ $1"
}

print_success() {
    print_color $GREEN "✓ $1"
}

print_warning() {
    print_color $YELLOW "⚠ $1"
}

print_error() {
    print_color $RED "✗ $1"
}

# Function to detect OS and architecture
detect_platform() {
    local os=""
    local arch=""
    
    case "$(uname -s)" in
        Linux*)
            os="linux"
            if grep -qi microsoft /proc/version 2>/dev/null; then
                os="wsl"
            fi
            ;;
        Darwin*)
            os="macos"
            ;;
        CYGWIN*|MINGW*|MSYS*)
            os="windows"
            ;;
        *)
            print_error "Unsupported operating system: $(uname -s)"
            exit 1
            ;;
    esac
    
    case "$(uname -m)" in
        x86_64|amd64)
            arch="amd64"
            ;;
        arm64|aarch64)
            arch="arm64"
            ;;
        *)
            print_error "Unsupported architecture: $(uname -m)"
            exit 1
            ;;
    esac
    
    echo "${os}-${arch}"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to install Node.js
install_nodejs() {
    print_step "Installing Node.js..."
    
    if command_exists node && [[ "$(node --version | cut -d. -f1 | sed 's/v//')" -ge 18 ]]; then
        print_success "Node.js $(node --version) is already installed"
        return 0
    fi
    
    case "$(detect_platform)" in
        macos-*)
            if command_exists brew; then
                brew install node
            else
                print_error "Homebrew not found. Please install Node.js manually from https://nodejs.org"
                exit 1
            fi
            ;;
        linux-*|wsl-*)
            if command_exists curl; then
                curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
                sudo apt-get install -y nodejs
            else
                print_error "curl not found. Please install Node.js manually"
                exit 1
            fi
            ;;
        *)
            print_error "Automatic Node.js installation not supported on this platform"
            exit 1
            ;;
    esac
    
    print_success "Node.js installed successfully"
}

# Function to install Bun
install_bun() {
    print_step "Installing Bun..."
    
    if command_exists bun; then
        print_success "Bun $(bun --version) is already installed"
        return 0
    fi
    
    curl -fsSL https://bun.sh/install | bash
    
    # Add Bun to PATH for current session
    export PATH="$HOME/.bun/bin:$PATH"
    
    if command_exists bun; then
        print_success "Bun installed successfully"
    else
        print_error "Failed to install Bun"
        exit 1
    fi
}

# Function to install Git
install_git() {
    print_step "Checking Git installation..."
    
    if command_exists git; then
        print_success "Git $(git --version | cut -d' ' -f3) is already installed"
        return 0
    fi
    
    case "$(detect_platform)" in
        macos-*)
            if command_exists brew; then
                brew install git
            else
                print_error "Homebrew not found. Please install Git manually"
                exit 1
            fi
            ;;
        linux-*|wsl-*)
            if command_exists apt-get; then
                sudo apt-get update && sudo apt-get install -y git
            elif command_exists yum; then
                sudo yum install -y git
            elif command_exists dnf; then
                sudo dnf install -y git
            else
                print_error "Package manager not found. Please install Git manually"
                exit 1
            fi
            ;;
        *)
            print_error "Automatic Git installation not supported on this platform"
            exit 1
            ;;
    esac
    
    print_success "Git installed successfully"
}

# Function to clone or update repository
setup_repository() {
    print_step "Setting up Vibe Code repository..."
    
    if [ -d "$INSTALL_DIR" ]; then
        print_step "Updating existing installation..."
        cd "$INSTALL_DIR"
        git pull origin main
    else
        print_step "Cloning repository..."
        git clone "$REPO_URL" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi
    
    print_success "Repository setup complete"
}

# Function to build desktop connector
build_desktop_connector() {
    print_step "Building desktop connector..."
    
    cd "$INSTALL_DIR"
    
    # Install dependencies
    print_step "Installing dependencies..."
    bun install
    
    # Build the desktop connector
    print_step "Building desktop connector package..."
    cd packages/desktop-connector
    bun run build
    
    print_success "Desktop connector built successfully"
}

# Function to create symlink
create_symlink() {
    print_step "Creating system-wide command..."
    
    local bin_dir="/usr/local/bin"
    local desktop_connector_path="$INSTALL_DIR/packages/desktop-connector/dist/index.js"
    
    # Create wrapper script
    cat > "$INSTALL_DIR/$BINARY_NAME" << EOF
#!/bin/bash
cd "$INSTALL_DIR/packages/desktop-connector"
node dist/index.js "\$@"
EOF
    
    chmod +x "$INSTALL_DIR/$BINARY_NAME"
    
    # Create symlink
    if [ -w "$bin_dir" ]; then
        ln -sf "$INSTALL_DIR/$BINARY_NAME" "$bin_dir/$BINARY_NAME"
        print_success "Created system command: $BINARY_NAME"
    else
        sudo ln -sf "$INSTALL_DIR/$BINARY_NAME" "$bin_dir/$BINARY_NAME"
        print_success "Created system command: $BINARY_NAME (with sudo)"
    fi
}

# Function to create desktop entry (Linux)
create_desktop_entry() {
    if [[ "$(detect_platform)" == linux-* ]]; then
        print_step "Creating desktop entry..."
        
        local desktop_dir="$HOME/.local/share/applications"
        mkdir -p "$desktop_dir"
        
        cat > "$desktop_dir/vibe-code.desktop" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Vibe Code
Comment=Universal AI Coding Assistant Platform
Exec=$BINARY_NAME start --open-browser
Icon=$INSTALL_DIR/assets/icon.png
Terminal=false
StartupNotify=true
Categories=Development;IDE;
EOF
        
        print_success "Desktop entry created"
    fi
}

# Function to check installation
verify_installation() {
    print_step "Verifying installation..."
    
    if command_exists "$BINARY_NAME"; then
        print_success "Desktop connector command is available"
        
        # Test the installation
        if "$BINARY_NAME" --version >/dev/null 2>&1; then
            print_success "Desktop connector is working correctly"
        else
            print_warning "Desktop connector command found but may not be working properly"
        fi
    else
        print_error "Desktop connector command not found"
        return 1
    fi
}

# Function to show post-install instructions
show_instructions() {
    echo ""
    print_color $GREEN "🎉 Installation completed successfully!"
    echo ""
    print_color $CYAN "📋 Next Steps:"
    echo ""
    print_color $YELLOW "1. Start the desktop connector:"
    print_color $NC "   $BINARY_NAME start"
    echo ""
    print_color $YELLOW "2. Check status:"
    print_color $NC "   $BINARY_NAME status"
    echo ""
    print_color $YELLOW "3. Stop the connector:"
    print_color $NC "   $BINARY_NAME stop"
    echo ""
    print_color $YELLOW "4. Access the web interface:"
    print_color $NC "   http://localhost:$DESKTOP_CONNECTOR_PORT"
    echo ""
    print_color $BLUE "📚 For more information:"
    print_color $NC "   https://docs.vibecode.com"
    echo ""
    print_color $GREEN "✨ Happy coding with Vibe Code!"
    echo ""
}

# Main installation function
main() {
    print_header
    
    print_color $BLUE "Detected platform: $(detect_platform)"
    echo ""
    
    # Check if running as root
    if [ "$EUID" -eq 0 ]; then
        print_warning "Running as root is not recommended. Continuing anyway..."
        echo ""
    fi
    
    # Install dependencies
    install_git
    install_nodejs
    install_bun
    
    # Setup repository and build
    setup_repository
    build_desktop_connector
    
    # Create system integration
    create_symlink
    create_desktop_entry
    
    # Verify and show instructions
    if verify_installation; then
        show_instructions
    else
        print_error "Installation verification failed"
        exit 1
    fi
}

# Run installation if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi