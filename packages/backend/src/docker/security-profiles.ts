import { SandboxConfig } from './sandbox-manager.js';

/**
 * Security profiles for different types of sandbox environments
 */
export interface SecurityProfile {
  name: string;
  description: string;
  riskLevel: 'safe' | 'moderate' | 'dangerous';
  config: Partial<SandboxConfig>;
  additionalRestrictions: {
    maxExecutionTime: number;
    maxFileSize: number;
    maxProcesses: number;
    allowNetworkAccess: boolean;
    allowFileSystemWrite: boolean;
    allowedPorts: number[];
    blockedDomains: string[];
  };
}

/**
 * Built-in security profiles
 */
export const SECURITY_PROFILES: Record<string, SecurityProfile> = {
  // Ultra-safe profile for untrusted code
  SAFE_MODE: {
    name: 'Safe Mode',
    description: 'Maximum security for untrusted code execution',
    riskLevel: 'safe',
    config: {
      memoryLimit: 128 * 1024 * 1024, // 128MB
      cpuLimit: 0.25, // 25% of CPU
      networkMode: 'none',
      readOnly: true,
      timeout: 30000, // 30 seconds
      allowedCommands: [
        'echo', 'cat', 'ls', 'pwd', 'head', 'tail', 'wc', 'grep',
        'python3', 'node', 'npm', 'yarn',
      ],
      blockedCommands: [
        'curl', 'wget', 'nc', 'netcat', 'ssh', 'scp', 'rsync',
        'mount', 'umount', 'sudo', 'su', 'chmod', 'chown',
        'iptables', 'systemctl', 'service', 'crontab',
        'rm', 'mv', 'cp', 'touch', 'mkdir', // No file modifications
      ],
      environmentVariables: {
        PATH: '/usr/local/bin:/usr/bin:/bin',
        HOME: '/tmp',
        TMPDIR: '/tmp',
        USER: 'nobody',
        SHELL: '/bin/sh',
      },
      volumes: [],
    },
    additionalRestrictions: {
      maxExecutionTime: 30000,
      maxFileSize: 1024 * 1024, // 1MB
      maxProcesses: 10,
      allowNetworkAccess: false,
      allowFileSystemWrite: false,
      allowedPorts: [],
      blockedDomains: ['*'],
    },
  },

  // Standard development environment
  DEVELOPMENT: {
    name: 'Development Mode',
    description: 'Balanced security for trusted development work',
    riskLevel: 'moderate',
    config: {
      memoryLimit: 512 * 1024 * 1024, // 512MB
      cpuLimit: 0.5, // 50% of CPU
      networkMode: 'bridge',
      readOnly: false,
      timeout: 300000, // 5 minutes
      allowedCommands: [
        'ls', 'cat', 'echo', 'pwd', 'cd', 'mkdir', 'touch', 'rm', 'mv', 'cp',
        'grep', 'find', 'head', 'tail', 'wc', 'sort', 'uniq', 'awk', 'sed',
        'python3', 'python', 'pip', 'pip3', 'node', 'npm', 'yarn', 'npx',
        'git', 'curl', 'wget', 'tar', 'gzip', 'unzip',
        'vim', 'nano', 'emacs', 'code',
      ],
      blockedCommands: [
        'sudo', 'su', 'passwd', 'chown', 'mount', 'umount',
        'systemctl', 'service', 'crontab', 'at',
        'iptables', 'ufw', 'firewall', 'reboot', 'shutdown', 'halt',
        'dd', 'fdisk', 'mkfs', 'fsck',
      ],
      environmentVariables: {
        PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        HOME: '/workspace',
        USER: 'developer',
        SHELL: '/bin/bash',
        EDITOR: 'nano',
        TERM: 'xterm-256color',
      },
      volumes: [
        { host: '/tmp/vibe-workspace', container: '/workspace', mode: 'rw' },
      ],
    },
    additionalRestrictions: {
      maxExecutionTime: 300000,
      maxFileSize: 100 * 1024 * 1024, // 100MB
      maxProcesses: 50,
      allowNetworkAccess: true,
      allowFileSystemWrite: true,
      allowedPorts: [80, 443, 8000, 8080, 3000, 5000],
      blockedDomains: ['localhost', '127.0.0.1', '0.0.0.0'],
    },
  },

  // For testing and CI/CD operations
  TESTING: {
    name: 'Testing Mode',
    description: 'Testing environment with controlled access',
    riskLevel: 'moderate',
    config: {
      memoryLimit: 1024 * 1024 * 1024, // 1GB
      cpuLimit: 1.0, // Full CPU core
      networkMode: 'bridge',
      readOnly: false,
      timeout: 600000, // 10 minutes
      allowedCommands: [
        'ls', 'cat', 'echo', 'pwd', 'cd', 'mkdir', 'touch', 'rm', 'mv', 'cp',
        'grep', 'find', 'head', 'tail', 'wc', 'sort', 'uniq', 'awk', 'sed',
        'python3', 'python', 'pip', 'pip3', 'node', 'npm', 'yarn', 'npx',
        'git', 'curl', 'wget', 'tar', 'gzip', 'unzip',
        'docker', 'docker-compose',
        'pytest', 'jest', 'mocha', 'karma', 'cypress',
        'make', 'cmake', 'gcc', 'g++', 'clang',
      ],
      blockedCommands: [
        'sudo', 'su', 'passwd', 'chown', 'mount', 'umount',
        'systemctl', 'service', 'crontab', 'at',
        'iptables', 'ufw', 'firewall', 'reboot', 'shutdown', 'halt',
      ],
      environmentVariables: {
        PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        HOME: '/workspace',
        USER: 'tester',
        SHELL: '/bin/bash',
        CI: 'true',
        NODE_ENV: 'test',
        PYTHONPATH: '/workspace',
      },
      volumes: [
        { host: '/tmp/vibe-test', container: '/workspace', mode: 'rw' },
        { host: '/var/run/docker.sock', container: '/var/run/docker.sock', mode: 'ro' },
      ],
    },
    additionalRestrictions: {
      maxExecutionTime: 600000,
      maxFileSize: 500 * 1024 * 1024, // 500MB
      maxProcesses: 100,
      allowNetworkAccess: true,
      allowFileSystemWrite: true,
      allowedPorts: [80, 443, 8000, 8080, 3000, 5000, 9000, 4200],
      blockedDomains: [],
    },
  },

  // High-privilege mode for dangerous operations
  DANGEROUS: {
    name: 'Dangerous Mode',
    description: 'Minimal restrictions for administrative tasks',
    riskLevel: 'dangerous',
    config: {
      memoryLimit: 2048 * 1024 * 1024, // 2GB
      cpuLimit: 2.0, // 2 CPU cores
      networkMode: 'host',
      readOnly: false,
      timeout: 1800000, // 30 minutes
      allowedCommands: [], // No command restrictions
      blockedCommands: [
        'rm -rf /', 'mkfs', 'fdisk', 'dd if=/dev/zero',
        'reboot', 'shutdown', 'halt', 'poweroff',
      ],
      environmentVariables: {
        PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        HOME: '/root',
        USER: 'root',
        SHELL: '/bin/bash',
        DANGEROUS_MODE: 'true',
      },
      volumes: [
        { host: '/tmp/vibe-dangerous', container: '/workspace', mode: 'rw' },
      ],
    },
    additionalRestrictions: {
      maxExecutionTime: 1800000,
      maxFileSize: 10 * 1024 * 1024 * 1024, // 10GB
      maxProcesses: 1000,
      allowNetworkAccess: true,
      allowFileSystemWrite: true,
      allowedPorts: [80, 443, 22, 21, 25, 53, 110, 143, 993, 995],
      blockedDomains: [],
    },
  },

  // Educational environment for learning
  EDUCATIONAL: {
    name: 'Educational Mode',
    description: 'Safe learning environment with educational tools',
    riskLevel: 'safe',
    config: {
      memoryLimit: 256 * 1024 * 1024, // 256MB
      cpuLimit: 0.5, // 50% of CPU
      networkMode: 'bridge',
      readOnly: false,
      timeout: 180000, // 3 minutes
      allowedCommands: [
        'ls', 'cat', 'echo', 'pwd', 'cd', 'mkdir', 'touch', 'rm', 'mv', 'cp',
        'grep', 'find', 'head', 'tail', 'wc', 'sort', 'uniq',
        'python3', 'python', 'node', 'gcc', 'g++', 'javac', 'java',
        'git', 'vim', 'nano', 'less', 'more',
        'curl', 'wget', 'ping',
      ],
      blockedCommands: [
        'sudo', 'su', 'passwd', 'chown', 'chmod',
        'mount', 'umount', 'systemctl', 'service',
        'iptables', 'nc', 'netcat', 'ssh', 'scp',
        'dd', 'fdisk', 'mkfs', 'crontab',
      ],
      environmentVariables: {
        PATH: '/usr/local/bin:/usr/bin:/bin',
        HOME: '/home/student',
        USER: 'student',
        SHELL: '/bin/bash',
        EDUCATIONAL_MODE: 'true',
        LANG: 'en_US.UTF-8',
      },
      volumes: [
        { host: '/tmp/vibe-education', container: '/home/student', mode: 'rw' },
      ],
    },
    additionalRestrictions: {
      maxExecutionTime: 180000,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxProcesses: 20,
      allowNetworkAccess: true,
      allowFileSystemWrite: true,
      allowedPorts: [80, 443, 8080],
      blockedDomains: ['admin', 'root', 'system'],
    },
  },
};

/**
 * Create a custom security profile
 */
export function createCustomProfile(
  name: string,
  description: string,
  baseProfile: keyof typeof SECURITY_PROFILES,
  overrides: Partial<SecurityProfile>
): SecurityProfile {
  const base = SECURITY_PROFILES[baseProfile];
  
  return {
    name,
    description,
    riskLevel: overrides.riskLevel || base.riskLevel,
    config: {
      ...base.config,
      ...overrides.config,
    },
    additionalRestrictions: {
      ...base.additionalRestrictions,
      ...overrides.additionalRestrictions,
    },
  };
}

/**
 * Security policy enforcement
 */
export class SecurityPolicyEnforcer {
  
  /**
   * Validate command against security profile
   */
  static validateCommand(command: string, profile: SecurityProfile): {
    allowed: boolean;
    violations: string[];
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  } {
    const violations: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

    // Check blocked commands
    for (const blocked of profile.config.blockedCommands || []) {
      if (command.toLowerCase().includes(blocked.toLowerCase())) {
        violations.push(`Blocked command detected: ${blocked}`);
        riskLevel = 'critical';
      }
    }

    // Check allowed commands (if specified)
    if (profile.config.allowedCommands && profile.config.allowedCommands.length > 0) {
      const isAllowed = profile.config.allowedCommands.some(allowed => 
        command.toLowerCase().includes(allowed.toLowerCase())
      );
      
      if (!isAllowed) {
        violations.push('Command not in allowed list');
        riskLevel = 'high';
      }
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
      { pattern: /rm\s+-rf\s+\//, risk: 'critical', description: 'Root filesystem deletion' },
      { pattern: />\s*\/dev\//, risk: 'high', description: 'Device file access' },
      { pattern: /\/proc\//, risk: 'medium', description: 'Process filesystem access' },
      { pattern: /\/sys\//, risk: 'medium', description: 'System filesystem access' },
      { pattern: /sudo|su\s/, risk: 'critical', description: 'Privilege escalation' },
      { pattern: /\$\(.*\)/, risk: 'medium', description: 'Command substitution' },
      { pattern: /`.*`/, risk: 'medium', description: 'Command substitution' },
      { pattern: /\|\s*sh/, risk: 'high', description: 'Shell pipe execution' },
      { pattern: /curl.*\|\s*bash/, risk: 'critical', description: 'Remote script execution' },
      { pattern: /wget.*\|\s*bash/, risk: 'critical', description: 'Remote script execution' },
    ];

    for (const { pattern, risk, description } of dangerousPatterns) {
      if (pattern.test(command)) {
        violations.push(`Dangerous pattern: ${description}`);
        if (riskLevel === 'low' || (risk === 'critical' || risk === 'high')) {
          riskLevel = risk as any;
        }
      }
    }

    // Check file system operations
    if (profile.additionalRestrictions.allowFileSystemWrite === false) {
      const writePatterns = [/\s*>\s*/, /\s*>>\s*/, /touch\s+/, /mkdir\s+/, /rm\s+/, /mv\s+/, /cp\s+/];
      for (const pattern of writePatterns) {
        if (pattern.test(command)) {
          violations.push('File system write operation not allowed');
          riskLevel = 'medium';
        }
      }
    }

    // Check network operations
    if (profile.additionalRestrictions.allowNetworkAccess === false) {
      const networkPatterns = [/curl\s+/, /wget\s+/, /nc\s+/, /netcat\s+/, /ssh\s+/, /scp\s+/];
      for (const pattern of networkPatterns) {
        if (pattern.test(command)) {
          violations.push('Network access not allowed');
          riskLevel = 'medium';
        }
      }
    }

    return {
      allowed: violations.length === 0,
      violations,
      riskLevel,
    };
  }

  /**
   * Validate environment variables
   */
  static validateEnvironment(envVars: Record<string, string>, profile: SecurityProfile): {
    allowed: boolean;
    violations: string[];
  } {
    const violations: string[] = [];

    // Check for dangerous environment variables
    const dangerousVars = ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'PATH'];
    
    for (const [key, value] of Object.entries(envVars)) {
      // Check for path injection
      if (key === 'PATH' && value.includes('..')) {
        violations.push('Path traversal in PATH environment variable');
      }

      // Check for library injection
      if (key === 'LD_PRELOAD' || key === 'LD_LIBRARY_PATH') {
        violations.push(`Dangerous environment variable: ${key}`);
      }

      // Check for script injection
      if (value.includes('$(') || value.includes('`')) {
        violations.push(`Command injection in environment variable: ${key}`);
      }
    }

    return {
      allowed: violations.length === 0,
      violations,
    };
  }

  /**
   * Get security recommendations for a profile
   */
  static getSecurityRecommendations(profile: SecurityProfile): string[] {
    const recommendations: string[] = [];

    if (profile.riskLevel === 'dangerous') {
      recommendations.push('Consider using a less privileged profile for this operation');
      recommendations.push('Enable comprehensive audit logging');
      recommendations.push('Limit session duration');
      recommendations.push('Monitor resource usage closely');
    }

    if (profile.config.networkMode === 'host') {
      recommendations.push('Host networking exposes all ports - consider bridge mode');
    }

    if (profile.config.readOnly === false) {
      recommendations.push('Enable read-only filesystem when possible');
    }

    if (profile.additionalRestrictions.maxExecutionTime > 300000) {
      recommendations.push('Long execution times increase security risk');
    }

    if (profile.config.memoryLimit && profile.config.memoryLimit > 1024 * 1024 * 1024) {
      recommendations.push('High memory limits may impact system stability');
    }

    return recommendations;
  }
}

/**
 * Profile manager for runtime profile selection
 */
export class ProfileManager {
  private customProfiles = new Map<string, SecurityProfile>();

  /**
   * Get a security profile by name
   */
  getProfile(name: string): SecurityProfile | undefined {
    return SECURITY_PROFILES[name] || this.customProfiles.get(name);
  }

  /**
   * List all available profiles
   */
  listProfiles(): { name: string; profile: SecurityProfile }[] {
    const builtIn = Object.entries(SECURITY_PROFILES).map(([name, profile]) => ({ name, profile }));
    const custom = Array.from(this.customProfiles.entries()).map(([name, profile]) => ({ name, profile }));
    
    return [...builtIn, ...custom];
  }

  /**
   * Register a custom profile
   */
  registerProfile(name: string, profile: SecurityProfile): void {
    this.customProfiles.set(name, profile);
  }

  /**
   * Remove a custom profile
   */
  removeProfile(name: string): boolean {
    return this.customProfiles.delete(name);
  }

  /**
   * Get profile recommendations based on use case
   */
  getRecommendedProfile(useCase: 'untrusted_code' | 'development' | 'testing' | 'education' | 'admin'): string {
    switch (useCase) {
      case 'untrusted_code':
        return 'SAFE_MODE';
      case 'development':
        return 'DEVELOPMENT';
      case 'testing':
        return 'TESTING';
      case 'education':
        return 'EDUCATIONAL';
      case 'admin':
        return 'DANGEROUS';
      default:
        return 'SAFE_MODE';
    }
  }
}

// Export singleton instance
export const profileManager = new ProfileManager();