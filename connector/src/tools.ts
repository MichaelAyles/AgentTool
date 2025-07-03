import { spawn, execSync } from 'child_process';
import { which } from 'shelljs';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface ToolCapability {
  name: string;
  description: string;
  commands: string[];
  category: 'core' | 'optional' | 'advanced';
}

export interface ToolInfo {
  name: string;
  displayName: string;
  version: string | null;
  path: string | null;
  isInstalled: boolean;
  isAvailable: boolean;
  capabilities: ToolCapability[];
  installCommand?: string;
  installUrl?: string;
  category: 'ai' | 'development' | 'devops' | 'system' | 'database' | 'cloud';
  description: string;
  lastChecked: Date;
  metadata?: {
    [key: string]: any;
  };
}

export interface ToolRegistry {
  [toolName: string]: ToolInfo;
}

export interface InstallationGuide {
  platform: string;
  commands: string[];
  description: string;
  url?: string;
}

export class ToolDetectionService {
  private registry: ToolRegistry = {};
  private detectionCache: Map<string, { result: ToolInfo; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 300000; // 5 minutes in milliseconds

  constructor() {
    this.initializeToolDefinitions();
  }

  private initializeToolDefinitions(): void {
    const toolDefinitions: Partial<ToolInfo>[] = [
      // AI Tools
      {
        name: 'claude-code',
        displayName: 'Claude Code',
        category: 'ai',
        description: 'Anthropic\'s official CLI for Claude AI assistance',
        capabilities: [
          {
            name: 'Code Generation',
            description: 'Generate code in multiple programming languages',
            commands: ['claude --print', 'claude --add-file'],
            category: 'core'
          },
          {
            name: 'Code Review',
            description: 'Review and analyze existing code',
            commands: ['claude --print', 'claude --add-dir'],
            category: 'core'
          },
          {
            name: 'Documentation',
            description: 'Generate documentation for code',
            commands: ['claude --print', 'claude --help'],
            category: 'core'
          }
        ],
        installCommand: 'npm install -g @anthropic-ai/claude-code',
        installUrl: 'https://github.com/anthropic-ai/claude-code'
      },
      {
        name: 'gemini',
        displayName: 'Gemini CLI',
        category: 'ai',
        description: 'Google\'s Gemini AI CLI tool',
        capabilities: [
          {
            name: 'AI Assistance',
            description: 'Get AI-powered help with various tasks',
            commands: ['gemini ask', 'gemini generate'],
            category: 'core'
          }
        ],
        installCommand: 'pip install google-generativeai',
        installUrl: 'https://ai.google.dev/docs'
      },
      
      // Development Tools
      {
        name: 'git',
        displayName: 'Git',
        category: 'development',
        description: 'Distributed version control system',
        capabilities: [
          {
            name: 'Version Control',
            description: 'Track changes in source code',
            commands: ['git add', 'git commit', 'git push', 'git pull'],
            category: 'core'
          },
          {
            name: 'Branching',
            description: 'Create and manage branches',
            commands: ['git branch', 'git checkout', 'git merge'],
            category: 'core'
          },
          {
            name: 'Remote Repositories',
            description: 'Work with remote Git repositories',
            commands: ['git clone', 'git remote', 'git fetch'],
            category: 'core'
          }
        ],
        installUrl: 'https://git-scm.com/downloads'
      },
      {
        name: 'node',
        displayName: 'Node.js',
        category: 'development',
        description: 'JavaScript runtime built on Chrome\'s V8 JavaScript engine',
        capabilities: [
          {
            name: 'JavaScript Runtime',
            description: 'Execute JavaScript code outside the browser',
            commands: ['node script.js', 'node --version'],
            category: 'core'
          },
          {
            name: 'Package Management',
            description: 'Manage Node.js packages with npm',
            commands: ['npm install', 'npm run', 'npm publish'],
            category: 'core'
          }
        ],
        installUrl: 'https://nodejs.org/en/download'
      },
      {
        name: 'python',
        displayName: 'Python',
        category: 'development',
        description: 'High-level programming language',
        capabilities: [
          {
            name: 'Python Runtime',
            description: 'Execute Python scripts and programs',
            commands: ['python script.py', 'python -m module'],
            category: 'core'
          },
          {
            name: 'Package Management',
            description: 'Manage Python packages with pip',
            commands: ['pip install', 'pip list', 'pip freeze'],
            category: 'core'
          }
        ],
        installUrl: 'https://www.python.org/downloads'
      },
      {
        name: 'cargo',
        displayName: 'Rust Cargo',
        category: 'development',
        description: 'Rust package manager and build system',
        capabilities: [
          {
            name: 'Rust Development',
            description: 'Build and manage Rust projects',
            commands: ['cargo build', 'cargo run', 'cargo test'],
            category: 'core'
          },
          {
            name: 'Package Management',
            description: 'Manage Rust crates and dependencies',
            commands: ['cargo install', 'cargo update', 'cargo publish'],
            category: 'core'
          }
        ],
        installUrl: 'https://rustup.rs'
      },
      
      // DevOps Tools
      {
        name: 'docker',
        displayName: 'Docker',
        category: 'devops',
        description: 'Platform for developing, shipping, and running applications in containers',
        capabilities: [
          {
            name: 'Container Management',
            description: 'Build, run, and manage containers',
            commands: ['docker build', 'docker run', 'docker ps'],
            category: 'core'
          },
          {
            name: 'Image Management',
            description: 'Work with Docker images',
            commands: ['docker pull', 'docker push', 'docker images'],
            category: 'core'
          }
        ],
        installUrl: 'https://docs.docker.com/get-docker'
      },
      {
        name: 'kubectl',
        displayName: 'Kubernetes CLI',
        category: 'devops',
        description: 'Command-line tool for controlling Kubernetes clusters',
        capabilities: [
          {
            name: 'Cluster Management',
            description: 'Manage Kubernetes clusters and resources',
            commands: ['kubectl get', 'kubectl apply', 'kubectl delete'],
            category: 'core'
          },
          {
            name: 'Pod Management',
            description: 'Manage pods and deployments',
            commands: ['kubectl logs', 'kubectl exec', 'kubectl port-forward'],
            category: 'core'
          }
        ],
        installUrl: 'https://kubernetes.io/docs/tasks/tools/install-kubectl'
      },
      {
        name: 'terraform',
        displayName: 'Terraform',
        category: 'devops',
        description: 'Infrastructure as Code tool',
        capabilities: [
          {
            name: 'Infrastructure Management',
            description: 'Deploy and manage infrastructure',
            commands: ['terraform init', 'terraform plan', 'terraform apply'],
            category: 'core'
          }
        ],
        installUrl: 'https://www.terraform.io/downloads'
      },
      
      // Cloud Tools
      {
        name: 'aws',
        displayName: 'AWS CLI',
        category: 'cloud',
        description: 'Amazon Web Services command-line interface',
        capabilities: [
          {
            name: 'AWS Service Management',
            description: 'Interact with AWS services',
            commands: ['aws s3', 'aws ec2', 'aws lambda'],
            category: 'core'
          }
        ],
        installCommand: 'pip install awscli',
        installUrl: 'https://aws.amazon.com/cli'
      },
      {
        name: 'gcloud',
        displayName: 'Google Cloud CLI',
        category: 'cloud',
        description: 'Google Cloud Platform command-line interface',
        capabilities: [
          {
            name: 'GCP Service Management',
            description: 'Interact with Google Cloud services',
            commands: ['gcloud compute', 'gcloud storage', 'gcloud functions'],
            category: 'core'
          }
        ],
        installUrl: 'https://cloud.google.com/sdk/docs/install'
      },
      {
        name: 'az',
        displayName: 'Azure CLI',
        category: 'cloud',
        description: 'Microsoft Azure command-line interface',
        capabilities: [
          {
            name: 'Azure Service Management',
            description: 'Interact with Azure services',
            commands: ['az vm', 'az storage', 'az webapp'],
            category: 'core'
          }
        ],
        installUrl: 'https://docs.microsoft.com/en-us/cli/azure/install-azure-cli'
      },
      
      // Database Tools
      {
        name: 'mysql',
        displayName: 'MySQL',
        category: 'database',
        description: 'MySQL database client',
        capabilities: [
          {
            name: 'Database Operations',
            description: 'Connect to and query MySQL databases',
            commands: ['mysql -u user -p', 'mysqldump'],
            category: 'core'
          }
        ],
        installUrl: 'https://dev.mysql.com/downloads/mysql'
      },
      {
        name: 'psql',
        displayName: 'PostgreSQL',
        category: 'database',
        description: 'PostgreSQL database client',
        capabilities: [
          {
            name: 'Database Operations',
            description: 'Connect to and query PostgreSQL databases',
            commands: ['psql -U user -d database', 'pg_dump'],
            category: 'core'
          }
        ],
        installUrl: 'https://www.postgresql.org/download'
      },
      {
        name: 'redis-cli',
        displayName: 'Redis CLI',
        category: 'database',
        description: 'Redis command-line interface',
        capabilities: [
          {
            name: 'Redis Operations',
            description: 'Interact with Redis databases',
            commands: ['redis-cli', 'redis-cli ping'],
            category: 'core'
          }
        ],
        installUrl: 'https://redis.io/download'
      },
      
      // System Tools
      {
        name: 'curl',
        displayName: 'cURL',
        category: 'system',
        description: 'Command-line tool for transferring data',
        capabilities: [
          {
            name: 'HTTP Requests',
            description: 'Make HTTP requests from command line',
            commands: ['curl -X GET', 'curl -X POST', 'curl -d data'],
            category: 'core'
          }
        ],
        installUrl: 'https://curl.se/download.html'
      },
      {
        name: 'wget',
        displayName: 'wget',
        category: 'system',
        description: 'Network downloader',
        capabilities: [
          {
            name: 'File Download',
            description: 'Download files from the web',
            commands: ['wget url', 'wget -r url'],
            category: 'core'
          }
        ],
        installUrl: 'https://www.gnu.org/software/wget'
      },
      {
        name: 'jq',
        displayName: 'jq',
        category: 'system',
        description: 'Lightweight JSON processor',
        capabilities: [
          {
            name: 'JSON Processing',
            description: 'Parse and manipulate JSON data',
            commands: ['jq .', 'jq ".field"', 'jq -r'],
            category: 'core'
          }
        ],
        installUrl: 'https://stedolan.github.io/jq/download'
      }
    ];

    // Initialize registry with default values
    toolDefinitions.forEach(def => {
      this.registry[def.name!] = {
        name: def.name!,
        displayName: def.displayName!,
        version: null,
        path: null,
        isInstalled: false,
        isAvailable: false,
        capabilities: def.capabilities || [],
        installCommand: def.installCommand,
        installUrl: def.installUrl,
        category: def.category!,
        description: def.description!,
        lastChecked: new Date(),
        metadata: {}
      };
    });
  }

  public async detectAllTools(): Promise<ToolRegistry> {
    const detectionPromises = Object.keys(this.registry).map(toolName => 
      this.detectTool(toolName)
    );

    await Promise.all(detectionPromises);
    return this.registry;
  }

  public async detectTool(toolName: string): Promise<ToolInfo> {
    // Check cache first
    const cached = this.detectionCache.get(toolName);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.result;
    }

    const toolInfo = this.registry[toolName];
    if (!toolInfo) {
      throw new Error(`Tool ${toolName} not found in registry`);
    }

    try {
      // Check if tool is in PATH
      const toolPath = which(toolName);
      toolInfo.path = toolPath?.toString() || null;
      toolInfo.isInstalled = !!toolPath;
      toolInfo.isAvailable = toolInfo.isInstalled;

      if (toolInfo.isInstalled) {
        // Try to get version information
        toolInfo.version = await this.getToolVersion(toolName);
        
        // Get additional metadata
        toolInfo.metadata = await this.getToolMetadata(toolName);
      }

      toolInfo.lastChecked = new Date();

      // Cache the result
      this.detectionCache.set(toolName, {
        result: { ...toolInfo },
        timestamp: Date.now()
      });

      return toolInfo;
    } catch (error) {
      console.error(`Error detecting tool ${toolName}:`, error);
      toolInfo.isInstalled = false;
      toolInfo.isAvailable = false;
      toolInfo.version = null;
      toolInfo.path = null;
      toolInfo.lastChecked = new Date();
      return toolInfo;
    }
  }

  private async getToolVersion(toolName: string): Promise<string | null> {
    const versionCommands: { [key: string]: string[] } = {
      'claude-code': ['claude', '--version'],
      'gemini': ['gemini', '--version'],
      'git': ['git', '--version'],
      'node': ['node', '--version'],
      'python': ['python', '--version'],
      'cargo': ['cargo', '--version'],
      'docker': ['docker', '--version'],
      'kubectl': ['kubectl', 'version', '--client'],
      'terraform': ['terraform', '--version'],
      'aws': ['aws', '--version'],
      'gcloud': ['gcloud', '--version'],
      'az': ['az', '--version'],
      'mysql': ['mysql', '--version'],
      'psql': ['psql', '--version'],
      'redis-cli': ['redis-cli', '--version'],
      'curl': ['curl', '--version'],
      'wget': ['wget', '--version'],
      'jq': ['jq', '--version']
    };

    const versionCmd = versionCommands[toolName];
    if (!versionCmd) {
      return null;
    }

    try {
      const result = execSync(versionCmd.join(' '), { 
        encoding: 'utf8', 
        timeout: 5000,
        stdio: 'pipe'
      });
      
      return this.parseVersion(result, toolName);
    } catch (error) {
      console.warn(`Failed to get version for ${toolName}:`, error);
      return null;
    }
  }

  private parseVersion(versionOutput: string, toolName: string): string | null {
    // Common version patterns
    const patterns = [
      /v?(\d+\.\d+\.\d+)/,           // Standard semver
      /version\s+(\d+\.\d+\.\d+)/i,  // "version X.Y.Z"
      /(\d+\.\d+\.\d+)/,             // Just the numbers
      /v?(\d+\.\d+)/                 // Major.minor
    ];

    for (const pattern of patterns) {
      const match = versionOutput.match(pattern);
      if (match) {
        return match[1];
      }
    }

    // Tool-specific parsing
    switch (toolName) {
      case 'kubectl':
        const kubectlMatch = versionOutput.match(/Client Version: v(\d+\.\d+\.\d+)/);
        return kubectlMatch ? kubectlMatch[1] : null;
      
      case 'terraform':
        const terraformMatch = versionOutput.match(/Terraform v(\d+\.\d+\.\d+)/);
        return terraformMatch ? terraformMatch[1] : null;
      
      default:
        return versionOutput.trim().split('\n')[0];
    }
  }

  private async getToolMetadata(toolName: string): Promise<{ [key: string]: any }> {
    const metadata: { [key: string]: any } = {};

    try {
      switch (toolName) {
        case 'git':
          metadata.config = await this.getGitConfig();
          break;
        
        case 'node':
          metadata.npmVersion = await this.getNpmVersion();
          break;
        
        case 'python':
          metadata.pipVersion = await this.getPipVersion();
          break;
        
        case 'docker':
          metadata.dockerInfo = await this.getDockerInfo();
          break;
        
        case 'kubectl':
          metadata.kubernetesContext = await this.getKubernetesContext();
          break;
        
        default:
          break;
      }
    } catch (error) {
      console.warn(`Failed to get metadata for ${toolName}:`, error);
    }

    return metadata;
  }

  private async getGitConfig(): Promise<{ [key: string]: string }> {
    try {
      const userNameCmd = execSync('git config user.name', { encoding: 'utf8', stdio: 'pipe' });
      const userEmailCmd = execSync('git config user.email', { encoding: 'utf8', stdio: 'pipe' });
      
      return {
        userName: userNameCmd.trim(),
        userEmail: userEmailCmd.trim()
      };
    } catch (error) {
      return {};
    }
  }

  private async getNpmVersion(): Promise<string | null> {
    try {
      const result = execSync('npm --version', { encoding: 'utf8', stdio: 'pipe' });
      return result.trim();
    } catch (error) {
      return null;
    }
  }

  private async getPipVersion(): Promise<string | null> {
    try {
      const result = execSync('pip --version', { encoding: 'utf8', stdio: 'pipe' });
      return result.trim();
    } catch (error) {
      return null;
    }
  }

  private async getDockerInfo(): Promise<{ [key: string]: any }> {
    try {
      const result = execSync('docker info --format "{{json .}}"', { 
        encoding: 'utf8', 
        stdio: 'pipe',
        timeout: 5000
      });
      return JSON.parse(result);
    } catch (error) {
      return {};
    }
  }

  private async getKubernetesContext(): Promise<string | null> {
    try {
      const result = execSync('kubectl config current-context', { 
        encoding: 'utf8', 
        stdio: 'pipe',
        timeout: 5000
      });
      return result.trim();
    } catch (error) {
      return null;
    }
  }

  public getToolsByCategory(category: string): ToolInfo[] {
    return Object.values(this.registry).filter(tool => tool.category === category);
  }

  public getInstalledTools(): ToolInfo[] {
    return Object.values(this.registry).filter(tool => tool.isInstalled);
  }

  public getMissingTools(): ToolInfo[] {
    return Object.values(this.registry).filter(tool => !tool.isInstalled);
  }

  public getInstallationGuides(toolName: string): InstallationGuide[] {
    const tool = this.registry[toolName];
    if (!tool) {
      return [];
    }

    const platform = os.platform();
    const guides: InstallationGuide[] = [];

    // Platform-specific installation guides
    switch (platform) {
      case 'darwin': // macOS
        guides.push({
          platform: 'macOS',
          commands: this.getMacOSInstallCommands(toolName),
          description: `Install ${tool.displayName} on macOS`,
          url: tool.installUrl
        });
        break;
      
      case 'linux':
        guides.push({
          platform: 'Linux',
          commands: this.getLinuxInstallCommands(toolName),
          description: `Install ${tool.displayName} on Linux`,
          url: tool.installUrl
        });
        break;
      
      case 'win32': // Windows
        guides.push({
          platform: 'Windows',
          commands: this.getWindowsInstallCommands(toolName),
          description: `Install ${tool.displayName} on Windows`,
          url: tool.installUrl
        });
        break;
    }

    return guides;
  }

  private getMacOSInstallCommands(toolName: string): string[] {
    const brewCommands: { [key: string]: string[] } = {
      'git': ['brew install git'],
      'node': ['brew install node'],
      'python': ['brew install python'],
      'cargo': ['brew install rust'],
      'docker': ['brew install --cask docker'],
      'kubectl': ['brew install kubectl'],
      'terraform': ['brew install terraform'],
      'aws': ['brew install awscli'],
      'gcloud': ['brew install --cask google-cloud-sdk'],
      'mysql': ['brew install mysql'],
      'psql': ['brew install postgresql'],
      'redis-cli': ['brew install redis'],
      'curl': ['brew install curl'],
      'wget': ['brew install wget'],
      'jq': ['brew install jq']
    };

    return brewCommands[toolName] || [`# Please visit ${this.registry[toolName]?.installUrl} for installation instructions`];
  }

  private getLinuxInstallCommands(toolName: string): string[] {
    const aptCommands: { [key: string]: string[] } = {
      'git': ['sudo apt update', 'sudo apt install git'],
      'node': ['curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -', 'sudo apt install nodejs'],
      'python': ['sudo apt update', 'sudo apt install python3 python3-pip'],
      'cargo': ['curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh'],
      'docker': ['sudo apt update', 'sudo apt install docker.io'],
      'kubectl': ['curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"', 'chmod +x kubectl', 'sudo mv kubectl /usr/local/bin/'],
      'terraform': ['wget -O- https://apt.releases.hashicorp.com/gpg | gpg --dearmor | sudo tee /usr/share/keyrings/hashicorp-archive-keyring.gpg', 'echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list', 'sudo apt update', 'sudo apt install terraform'],
      'aws': ['sudo apt update', 'sudo apt install awscli'],
      'mysql': ['sudo apt update', 'sudo apt install mysql-client'],
      'psql': ['sudo apt update', 'sudo apt install postgresql-client'],
      'redis-cli': ['sudo apt update', 'sudo apt install redis-tools'],
      'curl': ['sudo apt update', 'sudo apt install curl'],
      'wget': ['sudo apt update', 'sudo apt install wget'],
      'jq': ['sudo apt update', 'sudo apt install jq']
    };

    return aptCommands[toolName] || [`# Please visit ${this.registry[toolName]?.installUrl} for installation instructions`];
  }

  private getWindowsInstallCommands(toolName: string): string[] {
    const chocoCommands: { [key: string]: string[] } = {
      'git': ['choco install git'],
      'node': ['choco install nodejs'],
      'python': ['choco install python'],
      'cargo': ['choco install rust'],
      'docker': ['choco install docker-desktop'],
      'kubectl': ['choco install kubernetes-cli'],
      'terraform': ['choco install terraform'],
      'aws': ['choco install awscli'],
      'mysql': ['choco install mysql.workbench'],
      'curl': ['choco install curl'],
      'wget': ['choco install wget'],
      'jq': ['choco install jq']
    };

    return chocoCommands[toolName] || [`# Please visit ${this.registry[toolName]?.installUrl} for installation instructions`];
  }

  public async refreshToolStatus(toolName: string): Promise<ToolInfo> {
    // Clear cache for this tool
    this.detectionCache.delete(toolName);
    
    // Re-detect the tool
    return await this.detectTool(toolName);
  }

  public async refreshAllTools(): Promise<ToolRegistry> {
    // Clear all cache
    this.detectionCache.clear();
    
    // Re-detect all tools
    return await this.detectAllTools();
  }

  public getToolStatistics(): {
    total: number;
    installed: number;
    missing: number;
    byCategory: { [category: string]: { total: number; installed: number } };
  } {
    const tools = Object.values(this.registry);
    const installed = tools.filter(tool => tool.isInstalled);
    const missing = tools.filter(tool => !tool.isInstalled);

    const byCategory: { [category: string]: { total: number; installed: number } } = {};
    
    for (const tool of tools) {
      if (!byCategory[tool.category]) {
        byCategory[tool.category] = { total: 0, installed: 0 };
      }
      byCategory[tool.category].total++;
      if (tool.isInstalled) {
        byCategory[tool.category].installed++;
      }
    }

    return {
      total: tools.length,
      installed: installed.length,
      missing: missing.length,
      byCategory
    };
  }

  public getRegistry(): ToolRegistry {
    return { ...this.registry };
  }
}