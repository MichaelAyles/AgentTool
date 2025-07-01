import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

export interface CLIInfo {
  name: string;
  command: string;
  versionFlag: string;
  installCommand: string;
  installMethod: 'npm' | 'npx' | 'pip' | 'curl' | 'brew';
  checkCommand?: string;
  postInstallCheck?: () => Promise<boolean>;
}

const CLI_TOOLS: Record<string, CLIInfo> = {
  'claude-code': {
    name: 'Claude Code',
    command: 'claude-code',
    versionFlag: '--version',
    installCommand: 'npx @anthropic-ai/claude-code@latest',
    installMethod: 'npx',
    checkCommand: 'claude-code --help',
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
  async checkCLIAvailability(cliName: string): Promise<{
    available: boolean;
    version?: string;
    path?: string;
  }> {
    const cliInfo = CLI_TOOLS[cliName];
    if (!cliInfo) {
      throw new Error(`Unknown CLI tool: ${cliName}`);
    }

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
        };
      } catch (versionError) {
        // Command exists but version check failed, still consider it available
        return {
          available: true,
          path,
        };
      }
    } catch (error) {
      return { available: false };
    }
  }

  async installCLI(cliName: string): Promise<{
    success: boolean;
    message: string;
    error?: string;
  }> {
    const cliInfo = CLI_TOOLS[cliName];
    if (!cliInfo) {
      return {
        success: false,
        message: `Unknown CLI tool: ${cliName}`,
      };
    }

    try {
      console.log(`🔧 Installing ${cliInfo.name}...`);
      
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
        message: `Failed to install ${cliInfo.name}`,
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
}

// Singleton instance
export const cliInstaller = new CLIInstallerService();