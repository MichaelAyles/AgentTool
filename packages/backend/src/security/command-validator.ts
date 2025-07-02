import { SecurityLevel, SecurityEventType } from './types.js';
import { securityEventLogger } from './event-logger.js';

// Command risk levels
export enum CommandRisk {
  SAFE = 'safe',
  MODERATE = 'moderate',
  DANGEROUS = 'dangerous',
  CRITICAL = 'critical',
}

// Command classification result
export interface CommandClassification {
  command: string;
  risk: CommandRisk;
  securityLevel: SecurityLevel;
  reasons: string[];
  blocked: boolean;
  allowedInDangerousMode: boolean;
  requiresConfirmation: boolean;
}

// Command validation result
export interface ValidationResult {
  allowed: boolean;
  classification: CommandClassification;
  sanitizedCommand?: string;
  sanitizedArgs?: string[];
  warnings: string[];
  errors: string[];
}

// Dangerous command patterns
const DANGEROUS_COMMANDS = {
  // File system destruction
  destructive: [
    'rm',
    'rmdir',
    'del',
    'erase',
    'format',
    'mkfs',
    'dd',
    'shred',
    'wipe',
    'zero',
    'fdisk',
    'parted',
  ],

  // System modification
  system: [
    'chmod',
    'chown',
    'chgrp',
    'mount',
    'umount',
    'systemctl',
    'service',
    'init',
    'shutdown',
    'reboot',
    'halt',
  ],

  // User management
  user: [
    'passwd',
    'useradd',
    'userdel',
    'usermod',
    'groupadd',
    'groupdel',
    'su',
    'sudo',
    'doas',
  ],

  // Network/Security
  network: [
    'iptables',
    'ufw',
    'firewall-cmd',
    'netsh',
    'ipconfig',
    'ifconfig',
    'route',
    'nc',
    'netcat',
    'telnet',
  ],

  // Package management (can install malicious software)
  package: [
    'apt',
    'yum',
    'dnf',
    'pacman',
    'brew',
    'choco',
    'pip',
    'npm',
    'gem',
    'cargo',
    'go get',
    'composer',
  ],

  // Process control
  process: ['kill', 'killall', 'pkill', 'taskkill', 'tasklist'],
};

// Critical commands that should never be allowed
const CRITICAL_COMMANDS = [
  'format',
  'fdisk',
  'parted',
  'mkfs',
  'dd',
  'shred',
  'reboot',
  'shutdown',
  'halt',
  'init 0',
  'init 6',
];

// Commands that require dangerous mode
const DANGEROUS_MODE_COMMANDS = [
  ...DANGEROUS_COMMANDS.destructive,
  ...DANGEROUS_COMMANDS.system,
  ...DANGEROUS_COMMANDS.user,
  ...DANGEROUS_COMMANDS.network.slice(0, 5), // Only firewall commands
];

// Safe commands that should always be allowed
const SAFE_COMMANDS = [
  'ls',
  'dir',
  'pwd',
  'cd',
  'cat',
  'type',
  'head',
  'tail',
  'grep',
  'find',
  'which',
  'where',
  'echo',
  'printf',
  'date',
  'time',
  'whoami',
  'id',
  'ps',
  'top',
  'htop',
  'history',
  'alias',
  'help',
  'man',
  'info',
  'wc',
  'sort',
  'uniq',
  'cut',
  'awk',
  'sed',
  'tr',
  'tee',
  'xargs',
];

export class CommandValidator {
  /**
   * Validate and classify a command
   */
  static validateCommand(
    command: string,
    args: string[] = [],
    context: {
      userId: string;
      sessionId: string;
      dangerousModeEnabled: boolean;
      userRole: string;
      ipAddress?: string;
    }
  ): ValidationResult {
    const classification = this.classifyCommand(command, args);
    const result: ValidationResult = {
      allowed: false,
      classification,
      warnings: [],
      errors: [],
    };

    // Always block critical commands
    if (classification.risk === CommandRisk.CRITICAL) {
      result.allowed = false;
      result.errors.push('Critical command blocked for security');
      this.logBlockedCommand(command, args, context, 'critical_command');
      return result;
    }

    // Check if dangerous mode is required
    if (
      classification.risk === CommandRisk.DANGEROUS &&
      !context.dangerousModeEnabled
    ) {
      result.allowed = false;
      result.errors.push('Dangerous mode required for this command');
      this.logBlockedCommand(command, args, context, 'dangerous_mode_required');
      return result;
    }

    // Sanitize command and arguments
    const sanitized = this.sanitizeCommand(command, args);
    result.sanitizedCommand = sanitized.command;
    result.sanitizedArgs = sanitized.args;
    result.warnings = sanitized.warnings;

    // Additional validation based on command content
    const contentValidation = this.validateCommandContent(command, args);
    result.warnings.push(...contentValidation.warnings);
    result.errors.push(...contentValidation.errors);

    // Allow if no blocking errors
    result.allowed = result.errors.length === 0;

    if (result.allowed) {
      this.logAllowedCommand(command, args, context, classification);
    }

    return result;
  }

  /**
   * Classify command risk level
   */
  static classifyCommand(
    command: string,
    args: string[] = []
  ): CommandClassification {
    const cmdLower = command.toLowerCase();
    const fullCommand = [command, ...args].join(' ').toLowerCase();

    const classification: CommandClassification = {
      command,
      risk: CommandRisk.SAFE,
      securityLevel: SecurityLevel.SAFE,
      reasons: [],
      blocked: false,
      allowedInDangerousMode: true,
      requiresConfirmation: false,
    };

    // Check for critical commands
    if (
      CRITICAL_COMMANDS.some(
        critical =>
          cmdLower.includes(critical.toLowerCase()) ||
          fullCommand.includes(critical.toLowerCase())
      )
    ) {
      classification.risk = CommandRisk.CRITICAL;
      classification.securityLevel = SecurityLevel.CRITICAL;
      classification.reasons.push('Critical system command');
      classification.blocked = true;
      classification.allowedInDangerousMode = false;
      return classification;
    }

    // Check for dangerous commands
    if (
      DANGEROUS_MODE_COMMANDS.some(
        dangerous =>
          cmdLower.startsWith(dangerous.toLowerCase()) ||
          cmdLower === dangerous.toLowerCase()
      )
    ) {
      classification.risk = CommandRisk.DANGEROUS;
      classification.securityLevel = SecurityLevel.DANGEROUS;
      classification.reasons.push('Dangerous system operation');
      classification.requiresConfirmation = true;

      // Check specific dangerous patterns
      if (DANGEROUS_COMMANDS.destructive.includes(cmdLower)) {
        classification.reasons.push('File system destructive operation');
      }
      if (DANGEROUS_COMMANDS.system.includes(cmdLower)) {
        classification.reasons.push('System configuration change');
      }
      if (DANGEROUS_COMMANDS.user.includes(cmdLower)) {
        classification.reasons.push('User management operation');
      }

      return classification;
    }

    // Check for moderately risky commands
    if (this.isModeratlyRisky(command, args)) {
      classification.risk = CommandRisk.MODERATE;
      classification.securityLevel = SecurityLevel.MODERATE;
      classification.reasons.push('Moderate risk operation');
      return classification;
    }

    // Check if explicitly safe
    if (SAFE_COMMANDS.includes(cmdLower)) {
      classification.reasons.push('Explicitly safe command');
    }

    return classification;
  }

  /**
   * Sanitize command and arguments
   */
  static sanitizeCommand(
    command: string,
    args: string[]
  ): {
    command: string;
    args: string[];
    warnings: string[];
  } {
    const warnings: string[] = [];

    // Sanitize command
    let sanitizedCommand = command.trim();

    // Remove dangerous shell operators
    const dangerousOperators = ['|', '&', ';', '$(', '`', '>', '<', '||', '&&'];
    for (const op of dangerousOperators) {
      if (sanitizedCommand.includes(op)) {
        warnings.push(`Removed dangerous operator: ${op}`);
        sanitizedCommand = sanitizedCommand.replace(
          new RegExp(`\\${op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'),
          ''
        );
      }
    }

    // Sanitize arguments
    const sanitizedArgs = args.map(arg => {
      let sanitized = arg.trim();

      // Remove shell injection attempts
      const injectionPatterns = [
        /\$\([^)]*\)/g, // Command substitution
        /`[^`]*`/g, // Backtick execution
        /&&|;|\|\|/g, // Command chaining
        /<|>/g, // Redirection
      ];

      for (const pattern of injectionPatterns) {
        if (pattern.test(sanitized)) {
          warnings.push(`Sanitized argument: ${arg}`);
          sanitized = sanitized.replace(pattern, '');
        }
      }

      // Escape special characters
      sanitized = sanitized.replace(/['"\\]/g, '\\$&');

      return sanitized;
    });

    return {
      command: sanitizedCommand,
      args: sanitizedArgs,
      warnings,
    };
  }

  /**
   * Validate command content for suspicious patterns
   */
  static validateCommandContent(
    command: string,
    args: string[]
  ): {
    warnings: string[];
    errors: string[];
  } {
    const warnings: string[] = [];
    const errors: string[] = [];
    const fullCommand = [command, ...args].join(' ');

    // Check for suspicious patterns
    const suspiciousPatterns = [
      {
        pattern: /\bpasswd\b.*\broot\b/i,
        message: 'Root password change attempt',
      },
      {
        pattern: /\brm\b.*-rf.*\/\b/i,
        message: 'Recursive force delete of system directories',
      },
      {
        pattern: /\bchmod\b.*777/i,
        message: 'Setting dangerous file permissions',
      },
      { pattern: /\bmkfs\b/i, message: 'File system creation/formatting' },
      { pattern: /\bdd\b.*\/dev\//i, message: 'Direct device manipulation' },
      {
        pattern: /\bcurl\b.*\|\s*(bash|sh)/i,
        message: 'Downloading and executing remote scripts',
      },
      {
        pattern: /\bwget\b.*\|\s*(bash|sh)/i,
        message: 'Downloading and executing remote scripts',
      },
      {
        pattern: /\/etc\/passwd|\/etc\/shadow/i,
        message: 'System user file access',
      },
      { pattern: /\biptables\b.*-F/i, message: 'Firewall rules flush' },
    ];

    for (const { pattern, message } of suspiciousPatterns) {
      if (pattern.test(fullCommand)) {
        if (
          message.includes('Root password') ||
          message.includes('File system creation')
        ) {
          errors.push(message);
        } else {
          warnings.push(message);
        }
      }
    }

    // Check for path traversal attempts
    if (fullCommand.includes('../') || fullCommand.includes('..\\')) {
      warnings.push('Path traversal attempt detected');
    }

    // Check for binary execution in tmp directories
    if (/\/tmp\/.*\.(sh|exe|bin|out)/i.test(fullCommand)) {
      warnings.push('Execution of temporary files detected');
    }

    return { warnings, errors };
  }

  /**
   * Check if command is moderately risky
   */
  private static isModeratlyRisky(command: string, args: string[]): boolean {
    const cmdLower = command.toLowerCase();
    const fullCommand = [command, ...args].join(' ').toLowerCase();

    // Network commands (not in dangerous list)
    const networkCommands = ['ping', 'curl', 'wget', 'ssh', 'scp', 'rsync'];
    if (networkCommands.includes(cmdLower)) {
      return true;
    }

    // File operations with write permissions
    if (['cp', 'mv', 'mkdir', 'touch', 'ln'].includes(cmdLower)) {
      return true;
    }

    // Process monitoring/control
    if (['ps', 'top', 'htop', 'jobs', 'bg', 'fg', 'nohup'].includes(cmdLower)) {
      return true;
    }

    // Archive operations
    if (['tar', 'zip', 'unzip', 'gzip', 'gunzip'].includes(cmdLower)) {
      return true;
    }

    // Text editors (can modify files)
    if (['vi', 'vim', 'nano', 'emacs', 'code'].includes(cmdLower)) {
      return true;
    }

    // Check for moderate risk patterns in full command
    const moderatePatterns = [
      /\b(cp|mv)\b.*\/etc\//i,
      /\bmkdir\b.*\/.*\/.*\//i, // Deep directory creation
      /\bchmod\b/i,
      /\bchown\b/i,
    ];

    return moderatePatterns.some(pattern => pattern.test(fullCommand));
  }

  /**
   * Log blocked command attempt
   */
  private static logBlockedCommand(
    command: string,
    args: string[],
    context: any,
    reason: string
  ): void {
    securityEventLogger.logEvent({
      id: `blocked_cmd_${Date.now()}`,
      type: SecurityEventType.SECURITY_VIOLATION,
      severity: SecurityLevel.DANGEROUS,
      timestamp: new Date(),
      userId: context.userId,
      sessionId: context.sessionId,
      ipAddress: context.ipAddress || 'unknown',
      resource: 'command',
      action: 'blocked',
      outcome: 'blocked',
      metadata: {
        command,
        args,
        reason,
        userRole: context.userRole,
        dangerousModeEnabled: context.dangerousModeEnabled,
      },
    });
  }

  /**
   * Log allowed command
   */
  private static logAllowedCommand(
    command: string,
    args: string[],
    context: any,
    classification: CommandClassification
  ): void {
    if (classification.risk !== CommandRisk.SAFE) {
      securityEventLogger.logEvent({
        id: `allowed_cmd_${Date.now()}`,
        type: SecurityEventType.DANGEROUS_COMMAND_EXECUTED,
        severity: classification.securityLevel,
        timestamp: new Date(),
        userId: context.userId,
        sessionId: context.sessionId,
        ipAddress: context.ipAddress || 'unknown',
        resource: 'command',
        action: 'allowed',
        outcome: 'success',
        metadata: {
          command,
          args,
          risk: classification.risk,
          reasons: classification.reasons,
          dangerousModeEnabled: context.dangerousModeEnabled,
        },
      });
    }
  }

  /**
   * Get command suggestions for safer alternatives
   */
  static getSaferAlternatives(command: string): string[] {
    const suggestions: Record<string, string[]> = {
      rm: ['trash', 'mv to backup directory'],
      dd: ['cp for file copying', 'rsync for synchronization'],
      chmod: ['Use specific permissions instead of 777'],
      sudo: ['Use specific commands with limited scope'],
      'curl | bash': ['Download first, review, then execute'],
      'wget | sh': ['Download first, review, then execute'],
    };

    const cmdLower = command.toLowerCase();
    for (const [dangerous, alternatives] of Object.entries(suggestions)) {
      if (cmdLower.includes(dangerous)) {
        return alternatives;
      }
    }

    return [];
  }

  /**
   * Validate batch commands
   */
  static validateBatch(
    commands: Array<{ command: string; args: string[] }>,
    context: any
  ): Array<ValidationResult> {
    return commands.map(({ command, args }) =>
      this.validateCommand(command, args, context)
    );
  }
}
