import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import os from 'os';

const execAsync = promisify(exec);

export interface CLIInfo {
  name: string;
  command: string;
  versionFlag: string;
  installCommand: string;
  installMethod: 'npm' | 'npx' | 'pip' | 'curl' | 'brew' | 'docker' | 'wsl';
  checkCommand?: string;
  postInstallCheck?: () => Promise<boolean>;
  platformSupport?: {
    linux: boolean;
    darwin: boolean;
    win32: boolean;
  };
  fallbackMethod?: {
    platform: 'win32' | 'darwin';
    method: 'docker' | 'wsl';
    dockerImage?: string;
    wslDistro?: string;
  }[];
}

const CLI_TOOLS: Record<string, CLIInfo> = {
  'claude-code': {
    name: 'Claude Code',
    command: 'claude-code',
    versionFlag: '--version',
    installCommand: 'npx @anthropic-ai/claude-code@latest',
    installMethod: 'npx',
    checkCommand: 'claude-code --help',
    platformSupport: {
      linux: true,
      darwin: false, // Claude Code currently Linux-only
      win32: false,
    },
    fallbackMethod: [
      {
        platform: 'darwin',
        method: 'docker',
        dockerImage: 'ubuntu:22.04',
      },
      {
        platform: 'win32',
        method: 'wsl',
        wslDistro: 'Ubuntu-22.04',
      },
      {
        platform: 'win32',
        method: 'docker',
        dockerImage: 'ubuntu:22.04',
      },
    ],
  },
  'gemini-cli': {
    name: 'Gemini CLI',
    command: 'gemini',
    versionFlag: '--version',
    installCommand: 'pip install google-generativeai',
    installMethod: 'pip',
    checkCommand: 'gemini --help',
    postInstallCheck: async () => {
      try {
        // Check if Python gemini package is available
        await execAsync('python -c "import google.generativeai"');
        return true;
      } catch {
        return false;
      }
    },
  },
};

export class CLIInstallerService {
  private async detectPlatform(): Promise<'linux' | 'darwin' | 'win32'> {
    const platform = os.platform();
    return platform as 'linux' | 'darwin' | 'win32';
  }

  private async isWSLAvailable(): Promise<boolean> {
    try {
      await execAsync('wsl --version');
      return true;
    } catch {
      return false;
    }
  }

  private async isDockerAvailable(): Promise<boolean> {
    try {
      await execAsync('docker --version');
      const { stdout } = await execAsync('docker info');
      return stdout.includes('Server Version');
    } catch {
      return false;
    }
  }

  private async setupWSLEnvironment(distro: string): Promise<boolean> {
    try {
      // Check if WSL distro exists
      const { stdout } = await execAsync('wsl --list --verbose');
      if (!stdout.includes(distro)) {
        console.log(`📦 Installing WSL distribution: ${distro}`);
        await execAsync(`wsl --install -d ${distro}`);
        
        // Wait for installation to complete
        await new Promise(resolve => setTimeout(resolve, 30000));
      }

      // Install Node.js and npm in WSL
      await execAsync(`wsl -d ${distro} -- bash -c "curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs"`);
      
      return true;
    } catch (error) {
      console.error('WSL setup failed:', error);
      return false;
    }
  }

  private async setupDockerEnvironment(image: string): Promise<boolean> {
    try {
      // Pull the base image
      console.log(`📦 Setting up Docker environment with ${image}`);
      await execAsync(`docker pull ${image}`);
      
      // Create a container with Node.js
      const containerName = `vibe-code-${image.replace(':', '-')}`;
      await execAsync(`docker run -d --name ${containerName} ${image} tail -f /dev/null`);
      
      // Install Node.js in container
      await execAsync(`docker exec ${containerName} bash -c "apt-get update && apt-get install -y curl && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && apt-get install -y nodejs"`);
      
      return true;
    } catch (error) {
      console.error('Docker setup failed:', error);
      return false;
    }
  }

  async checkCLIAvailability(cliName: string): Promise<{
    available: boolean;
    version?: string;
    path?: string;
    method?: 'native' | 'docker' | 'wsl';
  }> {
    const cliInfo = CLI_TOOLS[cliName];
    if (!cliInfo) {
      throw new Error(`Unknown CLI tool: ${cliName}`);
    }

    const platform = await this.detectPlatform();
    
    // Check native support first
    if (cliInfo.platformSupport?.[platform]) {
      try {
        // First check if command exists
        const { stdout: whichOutput } = await execAsync(`which ${cliInfo.command}`);
        const path = whichOutput.trim();

        if (!path) {
          return { available: false };
        }

        // Try to get version
        try {
          const { stdout: versionOutput } = await execAsync(
            `${cliInfo.command} ${cliInfo.versionFlag}`,
            { timeout: 5000 }
          );
          
          return {
            available: true,
            version: versionOutput.trim(),
            path,
            method: 'native',
          };
        } catch (versionError) {
          // Command exists but version check failed, still consider it available
          return {
            available: true,
            path,
            method: 'native',
          };
        }
      } catch (error) {
        // Fall through to check fallback methods
      }
    }

    // Check fallback methods for unsupported platforms
    if (cliInfo.fallbackMethod) {
      const applicableFallbacks = cliInfo.fallbackMethod.filter(
        fallback => fallback.platform === platform
      );

      for (const fallback of applicableFallbacks) {
        if (fallback.method === 'wsl' && await this.isWSLAvailable()) {
          try {
            const { stdout } = await execAsync(
              `wsl -d ${fallback.wslDistro} -- which ${cliInfo.command}`
            );
            if (stdout.trim()) {
              const { stdout: versionOutput } = await execAsync(
                `wsl -d ${fallback.wslDistro} -- ${cliInfo.command} ${cliInfo.versionFlag}`,
                { timeout: 5000 }
              );
              return {
                available: true,
                version: versionOutput.trim(),
                path: `wsl:${fallback.wslDistro}:${stdout.trim()}`,
                method: 'wsl',
              };
            }
          } catch {
            // Continue to next fallback
          }
        }

        if (fallback.method === 'docker' && await this.isDockerAvailable()) {
          try {
            const containerName = `vibe-code-${fallback.dockerImage?.replace(':', '-')}`;
            const { stdout } = await execAsync(
              `docker exec ${containerName} which ${cliInfo.command} 2>/dev/null || echo ""`
            );
            if (stdout.trim()) {
              const { stdout: versionOutput } = await execAsync(
                `docker exec ${containerName} ${cliInfo.command} ${cliInfo.versionFlag}`,
                { timeout: 5000 }
              );
              return {
                available: true,
                version: versionOutput.trim(),
                path: `docker:${containerName}:${stdout.trim()}`,
                method: 'docker',
              };
            }
          } catch {
            // Continue to next fallback
          }
        }
      }
    }

    return { available: false };
  }

  async installCLI(cliName: string): Promise<{
    success: boolean;
    message: string;
    error?: string;
    method?: 'native' | 'docker' | 'wsl';
  }> {
    const cliInfo = CLI_TOOLS[cliName];
    if (!cliInfo) {
      return {
        success: false,
        message: `Unknown CLI tool: ${cliName}`,
      };
    }

    const platform = await this.detectPlatform();
    console.log(`🔧 Installing ${cliInfo.name} on ${platform}...`);

    // Try native installation first if supported
    if (cliInfo.platformSupport?.[platform]) {
      const nativeResult = await this.installNative(cliName, cliInfo);
      if (nativeResult.success) {
        return { ...nativeResult, method: 'native' };
      }
      console.log(`Native installation failed, trying fallback methods...`);
    }

    // Try fallback methods for unsupported platforms
    if (cliInfo.fallbackMethod) {
      const applicableFallbacks = cliInfo.fallbackMethod.filter(
        fallback => fallback.platform === platform
      );

      for (const fallback of applicableFallbacks) {
        console.log(`Trying ${fallback.method} fallback...`);
        
        if (fallback.method === 'wsl') {
          const wslResult = await this.installViaWSL(cliName, cliInfo, fallback);
          if (wslResult.success) {
            return { ...wslResult, method: 'wsl' };
          }
        }

        if (fallback.method === 'docker') {
          const dockerResult = await this.installViaDocker(cliName, cliInfo, fallback);
          if (dockerResult.success) {
            return { ...dockerResult, method: 'docker' };
          }
        }
      }
    }

    return {
      success: false,
      message: `Failed to install ${cliInfo.name} on ${platform}. No suitable installation method found.`,
    };
  }

  private async installNative(cliName: string, cliInfo: CLIInfo): Promise<{
    success: boolean;
    message: string;
    error?: string;
  }> {
    try {
      // Check if installer is available
      const installerAvailable = await this.checkInstallerAvailability(cliInfo.installMethod);
      if (!installerAvailable) {
        return {
          success: false,
          message: `Installer ${cliInfo.installMethod} is not available. Please install it first.`,
        };
      }

      // Run installation command
      const installResult = await this.runInstallCommand(cliInfo.installCommand);
      
      if (!installResult.success) {
        return installResult;
      }

      // Verify installation
      const verifyResult = await this.verifyCLIInstallation(cliName);
      
      return verifyResult;
    } catch (error) {
      return {
        success: false,
        message: `Failed to install ${cliInfo.name} natively`,
        error: error.message,
      };
    }
  }

  private async installViaWSL(cliName: string, cliInfo: CLIInfo, fallback: any): Promise<{
    success: boolean;
    message: string;
    error?: string;
  }> {
    try {
      if (!await this.isWSLAvailable()) {
        return {
          success: false,
          message: 'WSL is not available on this system',
        };
      }

      // Setup WSL environment
      const setupSuccess = await this.setupWSLEnvironment(fallback.wslDistro);
      if (!setupSuccess) {
        return {
          success: false,
          message: 'Failed to setup WSL environment',
        };
      }

      // Install CLI in WSL
      const installCommand = `wsl -d ${fallback.wslDistro} -- bash -c "${cliInfo.installCommand}"`;
      const installResult = await this.runInstallCommand(installCommand);
      
      if (!installResult.success) {
        return installResult;
      }

      return {
        success: true,
        message: `${cliInfo.name} installed successfully via WSL`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to install ${cliInfo.name} via WSL`,
        error: error.message,
      };
    }
  }

  private async installViaDocker(cliName: string, cliInfo: CLIInfo, fallback: any): Promise<{
    success: boolean;
    message: string;
    error?: string;
  }> {
    try {
      if (!await this.isDockerAvailable()) {
        return {
          success: false,
          message: 'Docker is not available on this system',
        };
      }

      // Setup Docker environment
      const setupSuccess = await this.setupDockerEnvironment(fallback.dockerImage);
      if (!setupSuccess) {
        return {
          success: false,
          message: 'Failed to setup Docker environment',
        };
      }

      // Install CLI in Docker container
      const containerName = `vibe-code-${fallback.dockerImage.replace(':', '-')}`;
      const installCommand = `docker exec ${containerName} bash -c "${cliInfo.installCommand}"`;
      const installResult = await this.runInstallCommand(installCommand);
      
      if (!installResult.success) {
        return installResult;
      }

      return {
        success: true,
        message: `${cliInfo.name} installed successfully via Docker`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to install ${cliInfo.name} via Docker`,
        error: error.message,
      };
    }
  }

  private async checkInstallerAvailability(method: string): Promise<boolean> {
    try {
      switch (method) {
        case 'npm':
        case 'npx':
          await execAsync('npm --version');
          return true;
        case 'pip':
          await execAsync('pip --version');
          return true;
        case 'brew':
          await execAsync('brew --version');
          return true;
        case 'curl':
          await execAsync('curl --version');
          return true;
        case 'docker':
          return await this.isDockerAvailable();
        case 'wsl':
          return await this.isWSLAvailable();
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  private async runInstallCommand(command: string): Promise<{
    success: boolean;
    message: string;
    error?: string;
  }> {
    return new Promise((resolve) => {
      const child = spawn('bash', ['-c', command], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
        console.log(`📦 ${data.toString().trim()}`);
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
        console.error(`📦 ${data.toString().trim()}`);
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            message: 'Installation completed successfully',
          });
        } else {
          resolve({
            success: false,
            message: 'Installation failed',
            error: stderr || stdout,
          });
        }
      });

      child.on('error', (error) => {
        resolve({
          success: false,
          message: 'Failed to run installation command',
          error: error.message,
        });
      });

      // Set timeout for installation
      setTimeout(() => {
        child.kill('SIGTERM');
        resolve({
          success: false,
          message: 'Installation timed out after 5 minutes',
        });
      }, 5 * 60 * 1000);
    });
  }

  private async verifyCLIInstallation(cliName: string): Promise<{
    success: boolean;
    message: string;
    error?: string;
  }> {
    const cliInfo = CLI_TOOLS[cliName];
    
    // Wait a moment for installation to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check if CLI is now available
    const availability = await this.checkCLIAvailability(cliName);
    
    if (!availability.available) {
      return {
        success: false,
        message: `${cliInfo.name} installation verification failed - command not found`,
      };
    }

    // Run post-install check if available
    if (cliInfo.postInstallCheck) {
      try {
        const postCheckResult = await cliInfo.postInstallCheck();
        if (!postCheckResult) {
          return {
            success: false,
            message: `${cliInfo.name} installation verification failed - post-install check failed`,
          };
        }
      } catch (error) {
        return {
          success: false,
          message: `${cliInfo.name} installation verification failed`,
          error: error.message,
        };
      }
    }

    return {
      success: true,
      message: `${cliInfo.name} installed and verified successfully`,
    };
  }

  async getAllCLIStatus(): Promise<Record<string, {
    available: boolean;
    version?: string;
    path?: string;
  }>> {
    const status: Record<string, any> = {};
    
    for (const cliName of Object.keys(CLI_TOOLS)) {
      status[cliName] = await this.checkCLIAvailability(cliName);
    }
    
    return status;
  }

  async ensureCLIAvailable(cliName: string, autoInstall: boolean = false): Promise<{
    available: boolean;
    installed?: boolean;
    message: string;
    error?: string;
  }> {
    // Check if already available
    const status = await this.checkCLIAvailability(cliName);
    
    if (status.available) {
      return {
        available: true,
        message: `${CLI_TOOLS[cliName]?.name || cliName} is already available`,
      };
    }

    if (!autoInstall) {
      return {
        available: false,
        message: `${CLI_TOOLS[cliName]?.name || cliName} is not installed`,
      };
    }

    // Attempt installation
    const installResult = await this.installCLI(cliName);
    
    return {
      available: installResult.success,
      installed: installResult.success,
      message: installResult.message,
      error: installResult.error,
    };
  }

  getSupportedCLIs(): string[] {
    return Object.keys(CLI_TOOLS);
  }

  getCLIInfo(cliName: string): CLIInfo | undefined {
    return CLI_TOOLS[cliName];
  }

  async getFallbackMethods(cliName: string): Promise<Array<{
    method: 'docker' | 'wsl' | 'manual';
    available: boolean;
    description: string;
    instructions?: string;
  }>> {
    const cliInfo = CLI_TOOLS[cliName];
    if (!cliInfo) {
      return [];
    }

    const platform = await this.detectPlatform();
    const fallbacks: Array<{
      method: 'docker' | 'wsl' | 'manual';
      available: boolean;
      description: string;
      instructions?: string;
    }> = [];

    // Add platform-specific fallbacks
    if (cliInfo.fallbackMethod) {
      const applicableFallbacks = cliInfo.fallbackMethod.filter(
        fallback => fallback.platform === platform
      );

      for (const fallback of applicableFallbacks) {
        if (fallback.method === 'docker') {
          const dockerAvailable = await this.isDockerAvailable();
          fallbacks.push({
            method: 'docker',
            available: dockerAvailable,
            description: `Run ${cliInfo.name} in Docker container (${fallback.dockerImage})`,
            instructions: dockerAvailable ? undefined : 'Install Docker Desktop and ensure it\'s running',
          });
        }

        if (fallback.method === 'wsl') {
          const wslAvailable = await this.isWSLAvailable();
          fallbacks.push({
            method: 'wsl',
            available: wslAvailable,
            description: `Run ${cliInfo.name} via Windows Subsystem for Linux`,
            instructions: wslAvailable ? undefined : 'Enable WSL and install a Linux distribution',
          });
        }
      }
    }

    // Always add manual installation as final fallback
    fallbacks.push({
      method: 'manual',
      available: true,
      description: `Manual installation of ${cliInfo.name}`,
      instructions: this.getManualInstallInstructions(cliName, platform),
    });

    return fallbacks;
  }

  private getManualInstallInstructions(cliName: string, platform: string): string {
    const cliInfo = CLI_TOOLS[cliName];
    
    switch (cliName) {
      case 'claude-code':
        if (platform === 'linux') {
          return `
1. Install Node.js: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs
2. Install Claude Code: npx @anthropic-ai/claude-code@latest --help
3. Verify: claude-code --version`;
        } else if (platform === 'darwin') {
          return `
Claude Code is currently Linux-only. Recommended alternatives:
1. Use Docker: docker run -it ubuntu:22.04 bash, then install Node.js and Claude Code
2. Use a Linux VM or remote server
3. Wait for official macOS support from Anthropic`;
        } else if (platform === 'win32') {
          return `
Claude Code is currently Linux-only. Recommended alternatives:
1. Enable WSL2: wsl --install
2. Install Ubuntu in WSL: wsl --install -d Ubuntu
3. In WSL: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs
4. In WSL: npx @anthropic-ai/claude-code@latest --help`;
        }
        break;

      case 'gemini-cli':
        if (platform === 'linux' || platform === 'darwin') {
          return `
1. Install Python: curl https://pyenv.run | bash (or use system package manager)
2. Install Gemini CLI: pip install google-generativeai
3. Set up API key: export GOOGLE_API_KEY=your_api_key
4. Verify: python -c "import google.generativeai"`;
        } else if (platform === 'win32') {
          return `
1. Install Python from python.org or Microsoft Store
2. Install Gemini CLI: pip install google-generativeai
3. Set up API key: set GOOGLE_API_KEY=your_api_key
4. Verify: python -c "import google.generativeai"`;
        }
        break;
    }

    return `Please refer to the official documentation for ${cliInfo?.name || cliName} installation instructions.`;
  }

  async installWithFallback(cliName: string, preferredMethod?: 'native' | 'docker' | 'wsl'): Promise<{
    success: boolean;
    message: string;
    method: 'native' | 'docker' | 'wsl' | 'manual';
    error?: string;
  }> {
    const cliInfo = CLI_TOOLS[cliName];
    if (!cliInfo) {
      return {
        success: false,
        message: `Unknown CLI tool: ${cliName}`,
        method: 'native',
      };
    }

    const platform = await this.detectPlatform();
    console.log(`🔧 Attempting to install ${cliInfo.name} on ${platform} with fallback support...`);

    // Try preferred method first if specified and supported
    if (preferredMethod && preferredMethod !== 'manual') {
      if (preferredMethod === 'native' && cliInfo.platformSupport?.[platform]) {
        const result = await this.installNative(cliName, cliInfo);
        if (result.success) {
          return { ...result, method: 'native' };
        }
      } else if (preferredMethod === 'docker') {
        const dockerAvailable = await this.isDockerAvailable();
        if (dockerAvailable) {
          const fallback = cliInfo.fallbackMethod?.find(f => f.method === 'docker' && f.platform === platform);
          if (fallback) {
            const result = await this.installViaDocker(cliName, cliInfo, fallback);
            if (result.success) {
              return { ...result, method: 'docker' };
            }
          }
        }
      } else if (preferredMethod === 'wsl') {
        const wslAvailable = await this.isWSLAvailable();
        if (wslAvailable) {
          const fallback = cliInfo.fallbackMethod?.find(f => f.method === 'wsl' && f.platform === platform);
          if (fallback) {
            const result = await this.installViaWSL(cliName, cliInfo, fallback);
            if (result.success) {
              return { ...result, method: 'wsl' };
            }
          }
        }
      }
    }

    // Fall back to automatic method selection
    const installResult = await this.installCLI(cliName);
    
    if (installResult.success) {
      return {
        success: true,
        message: installResult.message,
        method: installResult.method || 'native',
      };
    }

    // If all automated methods fail, provide manual instructions
    const instructions = this.getManualInstallInstructions(cliName, platform);
    
    return {
      success: false,
      message: `Automated installation failed. Manual installation required.`,
      method: 'manual',
      error: `${installResult.message}\n\nManual installation instructions:\n${instructions}`,
    };
  }

  async diagnoseInstallationIssues(cliName: string): Promise<{
    platform: string;
    issues: Array<{
      category: 'platform' | 'dependencies' | 'permissions' | 'network';
      severity: 'error' | 'warning' | 'info';
      message: string;
      suggestion?: string;
    }>;
    supportedMethods: string[];
  }> {
    const platform = await this.detectPlatform();
    const cliInfo = CLI_TOOLS[cliName];
    const issues: Array<{
      category: 'platform' | 'dependencies' | 'permissions' | 'network';
      severity: 'error' | 'warning' | 'info';
      message: string;
      suggestion?: string;
    }> = [];

    if (!cliInfo) {
      issues.push({
        category: 'platform',
        severity: 'error',
        message: `Unknown CLI tool: ${cliName}`,
      });
      return { platform, issues, supportedMethods: [] };
    }

    // Check platform support
    if (!cliInfo.platformSupport?.[platform]) {
      issues.push({
        category: 'platform',
        severity: 'error',
        message: `${cliInfo.name} does not natively support ${platform}`,
        suggestion: 'Consider using Docker or WSL for compatibility',
      });
    }

    // Check dependencies
    const installerAvailable = await this.checkInstallerAvailability(cliInfo.installMethod);
    if (!installerAvailable) {
      issues.push({
        category: 'dependencies',
        severity: 'error',
        message: `Required installer ${cliInfo.installMethod} is not available`,
        suggestion: `Install ${cliInfo.installMethod} first`,
      });
    }

    // Check Docker availability
    const dockerAvailable = await this.isDockerAvailable();
    if (!dockerAvailable) {
      issues.push({
        category: 'dependencies',
        severity: 'warning',
        message: 'Docker is not available',
        suggestion: 'Install Docker for container-based fallback',
      });
    }

    // Check WSL availability (Windows only)
    if (platform === 'win32') {
      const wslAvailable = await this.isWSLAvailable();
      if (!wslAvailable) {
        issues.push({
          category: 'dependencies',
          severity: 'warning',
          message: 'WSL is not available',
          suggestion: 'Enable WSL for Linux compatibility',
        });
      }
    }

    // Check network connectivity (basic test)
    try {
      await execAsync('ping -c 1 google.com', { timeout: 5000 });
    } catch {
      issues.push({
        category: 'network',
        severity: 'warning',
        message: 'Network connectivity may be limited',
        suggestion: 'Check internet connection and firewall settings',
      });
    }

    // Determine supported methods
    const supportedMethods: string[] = [];
    if (cliInfo.platformSupport?.[platform] && installerAvailable) {
      supportedMethods.push('native');
    }
    if (dockerAvailable) {
      supportedMethods.push('docker');
    }
    if (platform === 'win32' && await this.isWSLAvailable()) {
      supportedMethods.push('wsl');
    }
    supportedMethods.push('manual');

    return {
      platform,
      issues,
      supportedMethods,
    };
  }
}

// Singleton instance
export const cliInstaller = new CLIInstallerService();