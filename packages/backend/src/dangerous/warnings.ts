import { SecurityLevel } from '../security/types.js';
import { CommandRisk } from '../security/command-validator.js';

// Warning message types
export enum WarningType {
  DANGEROUS_MODE_ENABLE = 'dangerous_mode_enable',
  DANGEROUS_COMMAND = 'dangerous_command',
  HIGH_RISK_OPERATION = 'high_risk_operation',
  SYSTEM_MODIFICATION = 'system_modification',
  DATA_DESTRUCTION = 'data_destruction',
  SECURITY_BYPASS = 'security_bypass',
  TIMEOUT_WARNING = 'timeout_warning',
  RISK_THRESHOLD = 'risk_threshold',
  SUSPICIOUS_PATTERN = 'suspicious_pattern'
}

// Confirmation dialog configuration
export interface ConfirmationDialog {
  id: string;
  type: WarningType;
  title: string;
  message: string;
  details: string[];
  severity: SecurityLevel;
  requiresTyping?: string; // Text user must type to confirm
  countdown?: number; // Seconds before allowing confirmation
  risks: string[];
  alternatives: string[];
  confirmText: string;
  cancelText: string;
  icon: string;
  color: string;
}

// Security warning configuration  
export interface SecurityWarning {
  id: string;
  type: WarningType;
  message: string;
  severity: SecurityLevel;
  dismissible: boolean;
  autoExpire?: number; // milliseconds
  actions: SecurityWarningAction[];
  metadata: Record<string, any>;
}

export interface SecurityWarningAction {
  label: string;
  action: 'dismiss' | 'disable_dangerous' | 'view_logs' | 'contact_admin' | 'learn_more';
  style: 'primary' | 'secondary' | 'danger';
}

export class SecurityWarningService {
  
  /**
   * Generate confirmation dialog for dangerous mode enablement
   */
  static generateDangerousModeConfirmation(context: {
    reason?: string;
    duration: number;
    previousActivations: number;
    riskFactors: string[];
  }): ConfirmationDialog {
    const risks = [
      'Ability to execute system-level commands',
      'Potential for irreversible file system changes',
      'Access to sensitive system configurations',
      'Risk of data loss or corruption',
      'Possible security vulnerabilities exposure',
    ];

    if (context.riskFactors.length > 0) {
      risks.push(...context.riskFactors);
    }

    const alternatives = [
      'Use specific safe commands instead',
      'Request admin assistance for system changes',
      'Work in a sandboxed environment',
      'Create backup before proceeding',
    ];

    return {
      id: `dangerous_confirm_${Date.now()}`,
      type: WarningType.DANGEROUS_MODE_ENABLE,
      title: '⚠️ Enable Dangerous Mode',
      message: `You are about to enable Dangerous Mode, which allows execution of potentially harmful commands. This mode will automatically expire in ${Math.round(context.duration / 60000)} minutes.`,
      details: [
        `Reason: ${context.reason || 'Not specified'}`,
        `Previous activations today: ${context.previousActivations}`,
        `Maximum duration: ${Math.round(context.duration / 60000)} minutes`,
        'This action will be logged and audited',
      ],
      severity: SecurityLevel.DANGEROUS,
      requiresTyping: 'ENABLE DANGEROUS MODE',
      countdown: 10,
      risks,
      alternatives,
      confirmText: 'I understand the risks - Enable Dangerous Mode',
      cancelText: 'Cancel - Keep me safe',
      icon: '⚠️',
      color: '#ff6b35',
    };
  }

  /**
   * Generate confirmation dialog for dangerous commands
   */
  static generateCommandConfirmation(context: {
    command: string;
    args: string[];
    risk: CommandRisk;
    classification: string[];
    potentialImpact: string[];
  }): ConfirmationDialog {
    const fullCommand = [context.command, ...context.args].join(' ');
    
    let title = '⚠️ Dangerous Command';
    let requiresTyping: string | undefined;
    let countdown = 0;
    
    if (context.risk === CommandRisk.CRITICAL) {
      title = '🚨 CRITICAL: Extremely Dangerous Command';
      requiresTyping = 'I ACCEPT FULL RESPONSIBILITY';
      countdown = 15;
    } else if (context.risk === CommandRisk.DANGEROUS) {
      title = '⚠️ Dangerous Command Detected';
      requiresTyping = 'I understand the risks';
      countdown = 5;
    }

    return {
      id: `cmd_confirm_${Date.now()}`,
      type: WarningType.DANGEROUS_COMMAND,
      title,
      message: `The command "${fullCommand}" has been classified as ${context.risk.toUpperCase()} risk and may cause significant harm to your system.`,
      details: [
        `Command: ${fullCommand}`,
        `Risk Level: ${context.risk.toUpperCase()}`,
        `Classification: ${context.classification.join(', ')}`,
        'Execution will be logged and monitored',
      ],
      severity: this.mapRiskToSeverity(context.risk),
      requiresTyping,
      countdown,
      risks: context.potentialImpact,
      alternatives: this.getSaferAlternatives(context.command),
      confirmText: 'Execute Command',
      cancelText: 'Cancel Command',
      icon: context.risk === CommandRisk.CRITICAL ? '🚨' : '⚠️',
      color: context.risk === CommandRisk.CRITICAL ? '#d32f2f' : '#ff6b35',
    };
  }

  /**
   * Generate warning for approaching timeout
   */
  static generateTimeoutWarning(context: {
    remainingTime: number;
    commandsExecuted: number;
    riskScore: number;
  }): SecurityWarning {
    const minutes = Math.ceil(context.remainingTime / 60000);
    
    return {
      id: `timeout_warning_${Date.now()}`,
      type: WarningType.TIMEOUT_WARNING,
      message: `Dangerous mode will expire in ${minutes} minute${minutes !== 1 ? 's' : ''}. ${context.commandsExecuted} commands executed (Risk: ${context.riskScore}).`,
      severity: SecurityLevel.MODERATE,
      dismissible: true,
      autoExpire: 30000, // 30 seconds
      actions: [
        {
          label: 'Extend Session',
          action: 'learn_more',
          style: 'primary',
        },
        {
          label: 'Disable Now',
          action: 'disable_dangerous',
          style: 'secondary',
        },
      ],
      metadata: {
        remainingTime: context.remainingTime,
        commandsExecuted: context.commandsExecuted,
        riskScore: context.riskScore,
      },
    };
  }

  /**
   * Generate warning for high risk operations
   */
  static generateHighRiskWarning(context: {
    operation: string;
    riskScore: number;
    threshold: number;
    details: string[];
  }): SecurityWarning {
    return {
      id: `high_risk_${Date.now()}`,
      type: WarningType.HIGH_RISK_OPERATION,
      message: `High-risk operation detected: ${context.operation}. Current risk score: ${context.riskScore}/${context.threshold}`,
      severity: SecurityLevel.DANGEROUS,
      dismissible: false,
      actions: [
        {
          label: 'Continue Carefully',
          action: 'dismiss',
          style: 'danger',
        },
        {
          label: 'Disable Dangerous Mode',
          action: 'disable_dangerous',
          style: 'primary',
        },
        {
          label: 'View Security Logs',
          action: 'view_logs',
          style: 'secondary',
        },
      ],
      metadata: {
        operation: context.operation,
        riskScore: context.riskScore,
        threshold: context.threshold,
        details: context.details,
      },
    };
  }

  /**
   * Generate warning for system modifications
   */
  static generateSystemModificationWarning(context: {
    target: string;
    modification: string;
    reversible: boolean;
  }): SecurityWarning {
    return {
      id: `sys_mod_${Date.now()}`,
      type: WarningType.SYSTEM_MODIFICATION,
      message: `System modification detected: ${context.modification} on ${context.target}. ${context.reversible ? 'This change may be reversible.' : 'This change is likely IRREVERSIBLE.'}`,
      severity: context.reversible ? SecurityLevel.MODERATE : SecurityLevel.DANGEROUS,
      dismissible: true,
      autoExpire: 60000, // 1 minute
      actions: [
        {
          label: 'I Understand',
          action: 'dismiss',
          style: 'primary',
        },
        {
          label: 'Learn More',
          action: 'learn_more',
          style: 'secondary',
        },
      ],
      metadata: {
        target: context.target,
        modification: context.modification,
        reversible: context.reversible,
      },
    };
  }

  /**
   * Generate warning for data destruction operations
   */
  static generateDataDestructionWarning(context: {
    operation: string;
    targets: string[];
    estimatedData: string;
  }): SecurityWarning {
    return {
      id: `data_dest_${Date.now()}`,
      type: WarningType.DATA_DESTRUCTION,
      message: `🚨 DATA DESTRUCTION WARNING: ${context.operation} may permanently delete ${context.estimatedData} affecting ${context.targets.length} target(s).`,
      severity: SecurityLevel.CRITICAL,
      dismissible: false,
      actions: [
        {
          label: 'Stop Operation',
          action: 'disable_dangerous',
          style: 'danger',
        },
        {
          label: 'Contact Admin',
          action: 'contact_admin',
          style: 'primary',
        },
        {
          label: 'View Targets',
          action: 'learn_more',
          style: 'secondary',
        },
      ],
      metadata: {
        operation: context.operation,
        targets: context.targets,
        estimatedData: context.estimatedData,
      },
    };
  }

  /**
   * Generate warning for suspicious patterns
   */
  static generateSuspiciousPatternWarning(context: {
    pattern: string;
    frequency: number;
    timeWindow: number;
    actions: string[];
  }): SecurityWarning {
    return {
      id: `suspicious_${Date.now()}`,
      type: WarningType.SUSPICIOUS_PATTERN,
      message: `Suspicious activity pattern detected: ${context.pattern}. ${context.frequency} occurrences in ${context.timeWindow} minutes.`,
      severity: SecurityLevel.DANGEROUS,
      dismissible: false,
      actions: [
        {
          label: 'Disable Dangerous Mode',
          action: 'disable_dangerous',
          style: 'danger',
        },
        {
          label: 'View Security Logs',
          action: 'view_logs',
          style: 'primary',
        },
        {
          label: 'Contact Admin',
          action: 'contact_admin',
          style: 'secondary',
        },
      ],
      metadata: {
        pattern: context.pattern,
        frequency: context.frequency,
        timeWindow: context.timeWindow,
        actions: context.actions,
      },
    };
  }

  /**
   * Generate standard security disclaimer
   */
  static generateSecurityDisclaimer(): {
    title: string;
    content: string[];
    acknowledgment: string;
  } {
    return {
      title: 'Security Disclaimer',
      content: [
        'Dangerous Mode grants elevated privileges that can cause irreversible system damage.',
        'All commands executed in Dangerous Mode are logged and monitored for security purposes.',
        'Misuse of dangerous commands may result in data loss, system instability, or security breaches.',
        'You are solely responsible for any consequences resulting from commands executed in this mode.',
        'System administrators may revoke dangerous mode access at any time.',
        'Emergency disable mechanisms are in place to protect system integrity.',
      ],
      acknowledgment: 'I have read and understand the security implications of enabling Dangerous Mode.',
    };
  }

  /**
   * Get warning styling based on severity
   */
  static getWarningStyling(severity: SecurityLevel): {
    backgroundColor: string;
    borderColor: string;
    textColor: string;
    icon: string;
  } {
    switch (severity) {
      case SecurityLevel.SAFE:
        return {
          backgroundColor: '#e8f5e8',
          borderColor: '#4caf50',
          textColor: '#2e7d32',
          icon: 'ℹ️',
        };
      case SecurityLevel.MODERATE:
        return {
          backgroundColor: '#fff3e0',
          borderColor: '#ff9800',
          textColor: '#ef6c00',
          icon: '⚠️',
        };
      case SecurityLevel.DANGEROUS:
        return {
          backgroundColor: '#ffebee',
          borderColor: '#f44336',
          textColor: '#c62828',
          icon: '⚠️',
        };
      case SecurityLevel.CRITICAL:
        return {
          backgroundColor: '#fce4ec',
          borderColor: '#e91e63',
          textColor: '#ad1457',
          icon: '🚨',
        };
      default:
        return {
          backgroundColor: '#f5f5f5',
          borderColor: '#9e9e9e',
          textColor: '#424242',
          icon: 'ℹ️',
        };
    }
  }

  // Private helper methods

  private static mapRiskToSeverity(risk: CommandRisk): SecurityLevel {
    switch (risk) {
      case CommandRisk.SAFE: return SecurityLevel.SAFE;
      case CommandRisk.MODERATE: return SecurityLevel.MODERATE;
      case CommandRisk.DANGEROUS: return SecurityLevel.DANGEROUS;
      case CommandRisk.CRITICAL: return SecurityLevel.CRITICAL;
      default: return SecurityLevel.SAFE;
    }
  }

  private static getSaferAlternatives(command: string): string[] {
    const alternatives: Record<string, string[]> = {
      'rm': [
        'Use trash/recycle bin instead of permanent deletion',
        'Create backup before deleting files',
        'Use mv to move files to backup location',
        'Use specific file paths instead of wildcards',
      ],
      'chmod': [
        'Use specific permissions (e.g., 644, 755) instead of 777',
        'Apply permissions to specific files, not recursively',
        'Check current permissions first with ls -la',
      ],
      'chown': [
        'Verify the correct user/group before changing ownership',
        'Use sudo only when necessary',
        'Test on a single file first',
      ],
      'dd': [
        'Use cp for regular file copying',
        'Use rsync for synchronization',
        'Verify source and destination paths carefully',
      ],
      'mount': [
        'Check available mount points first',
        'Use read-only mounts when possible',
        'Verify filesystem type before mounting',
      ],
      'iptables': [
        'Test rules in a non-production environment first',
        'Keep a backup of current rules',
        'Use specific IP ranges instead of broad rules',
      ],
    };

    const cmdLower = command.toLowerCase();
    for (const [cmd, alts] of Object.entries(alternatives)) {
      if (cmdLower.includes(cmd)) {
        return alts;
      }
    }

    return [
      'Consider using a safer command alternative',
      'Test in a sandboxed environment first',
      'Create backups before making changes',
      'Consult documentation for safer options',
    ];
  }
}

// Pre-defined warning templates
export const WARNING_TEMPLATES = {
  DANGEROUS_MODE_FIRST_TIME: {
    title: 'First Time Using Dangerous Mode',
    message: 'This appears to be your first time enabling Dangerous Mode. Please review the security guidelines carefully.',
    tips: [
      'Start with low-risk commands to familiarize yourself',
      'Keep sessions as short as possible',
      'Always have backups before making system changes',
      'Use specific paths instead of wildcards when possible',
    ],
  },

  MULTIPLE_ACTIVATIONS: {
    title: 'Multiple Dangerous Mode Activations',
    message: 'You have activated Dangerous Mode multiple times today. Consider if all these activations are necessary.',
    tips: [
      'Batch related operations into single sessions',
      'Use regular mode for safe operations',
      'Consider requesting permanent elevated privileges if frequently needed',
    ],
  },

  HIGH_COMMAND_FREQUENCY: {
    title: 'High Command Execution Rate',
    message: 'You are executing commands at a high rate. Please slow down and carefully review each command.',
    tips: [
      'Take time to review each command before execution',
      'Use command history to avoid retyping',
      'Consider scripting repetitive tasks instead',
    ],
  },

  APPROACHING_TIMEOUT: {
    title: 'Session Expiring Soon',
    message: 'Your dangerous mode session will expire soon. Plan your remaining operations accordingly.',
    tips: [
      'Complete critical operations first',
      'Save your work before session expires',
      'You can request a new session if needed',
    ],
  },
};