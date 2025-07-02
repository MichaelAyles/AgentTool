#!/bin/bash

# Vibe Code Universal Setup Script
# Works on macOS, Linux, WSL, and Windows (with fallbacks)
# One-line usage: curl -fsSL https://raw.githubusercontent.com/your-org/vibe-code/main/setup.sh | bash

set -e

echo "🚀 Vibe Code Universal Setup & Launch"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Detect platform
detect_platform() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if grep -q Microsoft /proc/version 2>/dev/null; then
            echo "wsl"
        else
            echo "linux"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    elif [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
        echo "windows"
    else
        echo "unknown"
    fi
}

PLATFORM=$(detect_platform)
echo -e "${BLUE}📋 Detected platform: $PLATFORM${NC}"

# Check if running in supported environment
check_environment() {
    if command -v node >/dev/null 2>&1; then
        NODE_VERSION=$(node --version)
        echo -e "${GREEN}✅ Node.js found: $NODE_VERSION${NC}"
    else
        echo -e "${RED}❌ Node.js not found${NC}"
        install_node
    fi
}

# Install Node.js if missing
install_node() {
    echo -e "${YELLOW}📦 Installing Node.js...${NC}"
    case $PLATFORM in
        "macos")
            if command -v brew >/dev/null 2>&1; then
                brew install node
            else
                echo -e "${YELLOW}Installing Homebrew first...${NC}"
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
                brew install node
            fi
            ;;
        "linux"|"wsl")
            if command -v apt >/dev/null 2>&1; then
                curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
                sudo apt-get install -y nodejs
            elif command -v yum >/dev/null 2>&1; then
                curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
                sudo yum install -y nodejs
            else
                echo -e "${YELLOW}Installing via NodeSource binary...${NC}"
                curl -fsSL https://nodejs.org/dist/v20.10.0/node-v20.10.0-linux-x64.tar.xz | tar -xJ
                sudo mv node-v20.10.0-linux-x64 /opt/nodejs
                sudo ln -sf /opt/nodejs/bin/node /usr/local/bin/node
                sudo ln -sf /opt/nodejs/bin/npm /usr/local/bin/npm
            fi
            ;;
        "windows")
            echo -e "${RED}Please install Node.js from https://nodejs.org${NC}"
            exit 1
            ;;
    esac
}

# Install Bun
install_bun() {
    if command -v bun >/dev/null 2>&1; then
        BUN_VERSION=$(bun --version)
        echo -e "${GREEN}✅ Bun found: $BUN_VERSION${NC}"
        return
    fi

    echo -e "${YELLOW}📦 Installing Bun...${NC}"
    case $PLATFORM in
        "macos"|"linux"|"wsl")
            curl -fsSL https://bun.sh/install | bash
            # Source the shell to get bun in PATH
            export PATH="$HOME/.bun/bin:$PATH"
            ;;
        "windows")
            # Use npm to install bun on Windows
            npm install -g bun
            ;;
    esac
}

# Setup Docker for Claude Code (if needed)
setup_claude_docker() {
    if [[ "$PLATFORM" == "macos" ]] || [[ "$PLATFORM" == "windows" ]]; then
        echo -e "${YELLOW}🐳 Setting up Docker for Claude Code (Linux-only CLI)...${NC}"
        
        # Check if Docker is available
        if ! command -v docker >/dev/null 2>&1; then
            echo -e "${RED}❌ Docker not found. Claude Code requires Linux environment.${NC}"
            case $PLATFORM in
                "macos")
                    echo -e "${BLUE}💡 Install Docker Desktop: https://docker.com/products/docker-desktop${NC}"
                    echo -e "${BLUE}💡 Or use OrbStack: https://orbstack.dev${NC}"
                    ;;
                "windows")
                    echo -e "${BLUE}💡 Install Docker Desktop: https://docker.com/products/docker-desktop${NC}"
                    echo -e "${BLUE}💡 Or use WSL2 with Docker: https://docs.docker.com/desktop/wsl/${NC}"
                    ;;
            esac
            echo -e "${YELLOW}⚠️  Continuing without Claude Code support...${NC}"
            return 1
        fi

        # Create Claude Code Docker setup
        cat > claude-docker.sh << 'EOF'
#!/bin/bash
# Claude Code Docker Wrapper
docker run --rm -it \
  -v "$PWD:/workspace" \
  -w /workspace \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  node:18-slim \
  sh -c "npm install -g @anthropic-ai/claude-code && claude-code $*"
EOF
        chmod +x claude-docker.sh
        echo -e "${GREEN}✅ Created Claude Code Docker wrapper${NC}"
    fi
}

# Enhanced CLI installer that handles cross-platform issues
setup_cli_tools() {
    echo -e "${BLUE}🔧 Setting up CLI tools...${NC}"
    
    # Create a comprehensive CLI installer
    cat > cli-installer.js << 'EOF'
const { execSync, spawn } = require('child_process');
const os = require('os');
const fs = require('fs');

const platform = os.platform();
const isWindows = platform === 'win32';
const isMac = platform === 'darwin';
const isLinux = platform === 'linux';

console.log(`🔍 Platform: ${platform}`);

// Claude Code setup with fallbacks
async function setupClaudeCode() {
    try {
        if (isLinux) {
            console.log('📦 Installing Claude Code directly...');
            execSync('npm install -g @anthropic-ai/claude-code', { stdio: 'inherit' });
        } else if (isMac || isWindows) {
            console.log('🐳 Setting up Claude Code Docker wrapper...');
            // Check if Docker is available
            try {
                execSync('docker --version', { stdio: 'pipe' });
                console.log('✅ Docker available for Claude Code');
                
                // Create wrapper script
                const wrapperScript = `#!/bin/bash
if command -v docker >/dev/null 2>&1; then
    docker run --rm -it \\
        -v "\$PWD:/workspace" \\
        -w /workspace \\
        -e ANTHROPIC_API_KEY="\$ANTHROPIC_API_KEY" \\
        node:18-slim \\
        sh -c "npm install -g @anthropic-ai/claude-code && claude-code \$*"
else
    echo "❌ Claude Code requires Docker on macOS/Windows"
    echo "💡 Install Docker Desktop or use Linux/WSL"
    exit 1
fi`;
                
                fs.writeFileSync('claude-code-docker', wrapperScript);
                if (!isWindows) {
                    execSync('chmod +x claude-code-docker');
                }
                console.log('✅ Claude Code Docker wrapper created');
            } catch (e) {
                console.log('⚠️  Docker not available, Claude Code will be unavailable');
                console.log('💡 Install Docker Desktop for Claude Code support');
            }
        }
    } catch (error) {
        console.log('⚠️  Claude Code setup failed:', error.message);
    }
}

// Gemini CLI setup
async function setupGemini() {
    try {
        console.log('📦 Setting up Gemini CLI...');
        // Try pip first, then pip3
        try {
            execSync('pip install google-generativeai', { stdio: 'inherit' });
        } catch (e) {
            execSync('pip3 install google-generativeai', { stdio: 'inherit' });
        }
        console.log('✅ Gemini CLI installed');
    } catch (error) {
        console.log('⚠️  Gemini CLI setup failed:', error.message);
        console.log('💡 Make sure Python and pip are installed');
    }
}

// Main setup
async function main() {
    await setupClaudeCode();
    await setupGemini();
    console.log('🎉 CLI setup complete!');
}

main().catch(console.error);
EOF

    # Run the CLI installer
    node cli-installer.js
    rm cli-installer.js
}

# Fix node-pty compilation issues
fix_node_pty() {
    echo -e "${BLUE}🔧 Attempting to fix node-pty compilation...${NC}"
    
    case $PLATFORM in
        "macos")
            # Install Xcode command line tools if missing
            if ! xcode-select -p >/dev/null 2>&1; then
                echo -e "${YELLOW}Installing Xcode command line tools...${NC}"
                xcode-select --install
            fi
            
            # Try using node-gyp with python3
            export PYTHON=$(which python3)
            ;;
        "linux"|"wsl")
            # Install build essentials
            if command -v apt >/dev/null 2>&1; then
                sudo apt update
                sudo apt install -y build-essential python3-dev
            elif command -v yum >/dev/null 2>&1; then
                sudo yum groupinstall -y "Development Tools"
                sudo yum install -y python3-devel
            fi
            ;;
        "windows")
            echo -e "${YELLOW}Windows detected - installing windows-build-tools...${NC}"
            npm install -g windows-build-tools
            ;;
    esac
}

# Main installation function
main() {
    echo -e "${BLUE}🔍 Checking environment...${NC}"
    check_environment
    
    echo -e "${BLUE}📦 Installing Bun...${NC}"
    install_bun
    
    echo -e "${BLUE}🛠️  Fixing build tools...${NC}"
    fix_node_pty
    
    echo -e "${BLUE}📦 Installing dependencies...${NC}"
    # Try bun install with fallback to npm
    if command -v bun >/dev/null 2>&1; then
        bun install || {
            echo -e "${YELLOW}⚠️  Bun install failed, trying with npm...${NC}"
            npm install
        }
    else
        npm install
    fi
    
    echo -e "${BLUE}🔨 Building packages...${NC}"
    # Build shared packages first
    if command -v bun >/dev/null 2>&1; then
        bun run --filter @vibecode/shared build || echo -e "${YELLOW}⚠️  Shared build failed${NC}"
        bun run --filter @vibecode/adapter-sdk build || echo -e "${YELLOW}⚠️  SDK build failed${NC}"
    else
        npm run build || echo -e "${YELLOW}⚠️  Build failed${NC}"
    fi
    
    echo -e "${BLUE}🔧 Setting up CLI tools...${NC}"
    setup_cli_tools
    
    echo -e "${BLUE}🐳 Setting up Docker fallbacks...${NC}"
    setup_claude_docker || true
    
    echo -e "${BLUE}🎯 Creating environment file...${NC}"
    if [ ! -f .env ]; then
        cp .env.example .env
        echo -e "${GREEN}✅ Created .env file${NC}"
    fi
    
    echo -e "${GREEN}🎉 Setup complete!${NC}"
    echo ""
    echo -e "${BLUE}📋 Quick Start Commands:${NC}"
    echo -e "  ${GREEN}bun dev${NC}     - Start development servers"
    echo -e "  ${GREEN}bun build${NC}   - Build all packages"
    echo -e "  ${GREEN}bun test${NC}    - Run tests"
    echo ""
    echo -e "${BLUE}🌐 Application URLs:${NC}"
    echo -e "  Frontend:  ${GREEN}http://localhost:5173${NC}"
    echo -e "  Backend:   ${GREEN}http://localhost:3000${NC}"
    echo -e "  WebSocket: ${GREEN}ws://localhost:3000${NC}"
    echo ""
    echo -e "${GREEN}🚀 Starting Vibe Code servers...${NC}"
    echo -e "${YELLOW}⏳ This may take a moment for the first startup...${NC}"
    echo -e "${BLUE}💡 The ready message with clickable links will appear shortly!${NC}"
    echo -e "${BLUE}   (It may appear multiple times to stay visible)${NC}"
    echo ""
    
    # Start the application
    if command -v bun >/dev/null 2>&1; then
        bun dev
    else
        npm run dev
    fi
}

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}🛑 Shutting down...${NC}"
    # Kill background processes
    jobs -p | xargs -r kill 2>/dev/null || true
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Run main function
main "$@"