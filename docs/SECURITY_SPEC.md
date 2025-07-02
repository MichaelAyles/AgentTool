# Security Model Specification

## Overview

This document defines the security architecture for Vibe Code, including safe/dangerous mode, authentication, authorization, and sandboxing.

## Security Modes

### Safe Mode (Default)

```typescript
interface SafeModeRestrictions {
  // File system
  allowedPaths: string[];
  deniedPaths: string[];
  readOnlyPaths: string[];

  // Network
  allowedHosts: string[];
  blockedPorts: number[];

  // Commands
  allowedCommands: string[];
  blockedCommands: string[];

  // Resources
  maxMemory: number;
  maxCPU: number;
  maxProcesses: number;
  timeout: number;
}
```

### Dangerous Mode

```typescript
interface DangerousModeConfig {
  enabled: boolean;
  requiresConfirmation: boolean;
  auditLogging: boolean;
  timeoutMinutes: number;
  allowedUsers: string[];
  restrictions: Partial<SafeModeRestrictions>;
}
```

## Authentication & Authorization

### Authentication System

```typescript
export class AuthenticationService {
  private providers: Map<string, AuthProvider> = new Map();

  async authenticate(method: string, credentials: any): Promise<User> {
    const provider = this.providers.get(method);
    if (!provider) {
      throw new AuthError('Unsupported auth method');
    }

    return await provider.authenticate(credentials);
  }

  async validateToken(token: string): Promise<User | null> {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!);
      return await this.getUserFromToken(decoded);
    } catch {
      return null;
    }
  }
}

// Auth providers
interface AuthProvider {
  name: string;
  authenticate(credentials: any): Promise<User>;
  refresh?(refreshToken: string): Promise<TokenPair>;
}

// Built-in providers
export class LocalAuthProvider implements AuthProvider {
  name = 'local';

  async authenticate(credentials: LoginCredentials): Promise<User> {
    const user = await this.findUser(credentials.username);
    const valid = await bcrypt.compare(credentials.password, user.passwordHash);

    if (!valid) {
      throw new AuthError('Invalid credentials');
    }

    return user;
  }
}

export class OAuthProvider implements AuthProvider {
  name = 'oauth';

  async authenticate(credentials: OAuthCredentials): Promise<User> {
    // OAuth flow implementation
    const userInfo = await this.exchangeCodeForUserInfo(credentials.code);
    return await this.findOrCreateUser(userInfo);
  }
}
```

### Role-Based Access Control

```typescript
enum Permission {
  PROJECT_CREATE = 'project:create',
  PROJECT_READ = 'project:read',
  PROJECT_WRITE = 'project:write',
  PROJECT_DELETE = 'project:delete',

  SESSION_CREATE = 'session:create',
  SESSION_EXECUTE = 'session:execute',
  SESSION_DANGEROUS = 'session:dangerous',

  ADAPTER_INSTALL = 'adapter:install',
  ADAPTER_CONFIGURE = 'adapter:configure',

  SYSTEM_ADMIN = 'system:admin',
}

interface Role {
  name: string;
  permissions: Permission[];
  inherits?: string[];
}

export class AuthorizationService {
  private roles: Map<string, Role> = new Map();

  async hasPermission(user: User, permission: Permission): Promise<boolean> {
    const userRoles = await this.getUserRoles(user.id);
    return this.checkPermission(userRoles, permission);
  }

  private checkPermission(roles: Role[], permission: Permission): boolean {
    for (const role of roles) {
      if (role.permissions.includes(permission)) {
        return true;
      }

      // Check inherited roles
      if (role.inherits) {
        const inheritedRoles = role.inherits.map(name => this.roles.get(name)!);
        if (this.checkPermission(inheritedRoles, permission)) {
          return true;
        }
      }
    }

    return false;
  }
}
```

## Sandboxing

### Process Sandboxing

```typescript
export class ProcessSandbox {
  private config: SandboxConfig;

  constructor(config: SandboxConfig) {
    this.config = config;
  }

  async createSandbox(options: SandboxOptions): Promise<Sandbox> {
    // Create isolated environment
    const sandbox = new Sandbox({
      workingDirectory: this.createTempDirectory(),
      environment: this.buildSafeEnvironment(options),
      limits: this.config.resourceLimits,
    });

    // Apply restrictions
    await this.applyFileSystemRestrictions(sandbox);
    await this.applyNetworkRestrictions(sandbox);
    await this.applyCommandRestrictions(sandbox);

    return sandbox;
  }

  private async applyFileSystemRestrictions(sandbox: Sandbox): Promise<void> {
    // Mount allowed paths as read-only or read-write
    for (const path of this.config.allowedPaths) {
      await sandbox.mount(path, { readonly: false });
    }

    for (const path of this.config.readOnlyPaths) {
      await sandbox.mount(path, { readonly: true });
    }

    // Block access to sensitive paths
    for (const path of this.config.deniedPaths) {
      await sandbox.block(path);
    }
  }
}

// Container-based sandboxing
export class DockerSandbox implements Sandbox {
  private container?: Docker.Container;

  async spawn(command: string, args: string[]): Promise<ProcessHandle> {
    this.container = await docker.createContainer({
      Image: 'vibecode-sandbox',
      Cmd: [command, ...args],
      WorkingDir: '/workspace',
      NetworkMode: this.config.networkMode,
      HostConfig: {
        Memory: this.config.maxMemory,
        CpuShares: this.config.maxCPU,
        ReadonlyRootfs: true,
        Binds: this.buildBindMounts(),
      },
    });

    await this.container.start();
    return this.createProcessHandle();
  }
}
```

### Network Security

```typescript
export class NetworkSecurityManager {
  async validateOutboundConnection(
    host: string,
    port: number,
    user: User
  ): Promise<boolean> {
    // Check against whitelist/blacklist
    if (this.isBlocked(host, port)) {
      return false;
    }

    // Check user permissions
    if (!(await this.hasNetworkAccess(user))) {
      return false;
    }

    // Additional checks for dangerous mode
    if (this.isDangerousHost(host) && !user.dangerousModeEnabled) {
      return false;
    }

    return true;
  }

  private isBlocked(host: string, port: number): boolean {
    // Block private networks in safe mode
    const privateRanges = [
      /^127\./, // localhost
      /^10\./, // private class A
      /^172\.(1[6-9]|2[0-9]|3[01])\./, // private class B
      /^192\.168\./, // private class C
    ];

    return privateRanges.some(range => range.test(host));
  }
}
```

## Command Validation

### Command Filtering

```typescript
export class CommandValidator {
  private dangerousCommands = new Set([
    'rm',
    'rmdir',
    'del',
    'format',
    'sudo',
    'su',
    'passwd',
    'chmod',
    'chown',
    'chgrp',
    'iptables',
    'netsh',
    'systemctl',
    'service',
    'crontab',
    'at',
  ]);

  async validateCommand(
    command: string,
    user: User,
    securityContext: SecurityContext
  ): Promise<ValidationResult> {
    const parsed = this.parseCommand(command);

    // Check if command is allowed
    if (!this.isCommandAllowed(parsed.command, securityContext)) {
      return {
        valid: false,
        reason: 'Command not allowed in current security context',
        severity: 'high',
      };
    }

    // Check for dangerous operations
    if (this.isDangerous(parsed) && !securityContext.dangerousMode) {
      return {
        valid: false,
        reason: 'Dangerous command requires dangerous mode',
        severity: 'critical',
      };
    }

    // Validate arguments
    const argValidation = await this.validateArguments(parsed, securityContext);
    if (!argValidation.valid) {
      return argValidation;
    }

    return { valid: true };
  }

  private parseCommand(command: string): ParsedCommand {
    // Sophisticated command parsing
    // Handle pipes, redirects, subcommands, etc.
  }
}
```

## Audit Logging

### Security Audit System

```typescript
export class SecurityAuditLogger {
  async logSecurityEvent(event: SecurityEvent): Promise<void> {
    const auditEntry: AuditEntry = {
      timestamp: new Date(),
      userId: event.userId,
      sessionId: event.sessionId,
      action: event.action,
      resource: event.resource,
      result: event.result,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      dangerousMode: event.dangerousMode,
      severity: this.calculateSeverity(event),
    };

    // Write to audit log
    await this.writeAuditEntry(auditEntry);

    // Alert if critical
    if (auditEntry.severity === 'critical') {
      await this.sendSecurityAlert(auditEntry);
    }
  }

  async getAuditTrail(filters: AuditFilters): Promise<AuditEntry[]> {
    return await this.queryAuditLog(filters);
  }
}

interface SecurityEvent {
  userId: string;
  sessionId: string;
  action: SecurityAction;
  resource: string;
  result: 'allowed' | 'denied' | 'error';
  ipAddress: string;
  userAgent: string;
  dangerousMode: boolean;
  metadata?: Record<string, unknown>;
}

enum SecurityAction {
  COMMAND_EXECUTE = 'command:execute',
  FILE_ACCESS = 'file:access',
  NETWORK_REQUEST = 'network:request',
  DANGEROUS_MODE_ENABLE = 'dangerous:enable',
  PRIVILEGE_ESCALATION = 'privilege:escalation',
}
```

## Session Security

### Secure Session Management

```typescript
export class SecureSessionManager {
  private sessions = new Map<string, SecureSession>();

  async createSession(
    user: User,
    options: SessionOptions
  ): Promise<SecureSession> {
    const session = new SecureSession({
      id: generateSecureId(),
      userId: user.id,
      startTime: new Date(),
      securityContext: await this.createSecurityContext(user, options),
      expiresAt: this.calculateExpiry(options),
    });

    this.sessions.set(session.id, session);

    // Set up session monitoring
    this.startSessionMonitoring(session);

    return session;
  }

  private async createSecurityContext(
    user: User,
    options: SessionOptions
  ): Promise<SecurityContext> {
    return {
      userId: user.id,
      permissions: await this.getUserPermissions(user),
      safeMode: !options.dangerousMode,
      restrictions: await this.getRestrictions(user, options),
      auditEnabled: true,
    };
  }

  private startSessionMonitoring(session: SecureSession): void {
    // Monitor for suspicious activity
    setInterval(async () => {
      const activity = await this.getSessionActivity(session.id);
      await this.analyzeActivity(activity);
    }, 30000); // Check every 30 seconds
  }
}
```

## Dangerous Mode Implementation

### Dangerous Mode Controller

```typescript
export class DangerousModeController {
  async enableDangerousMode(
    user: User,
    sessionId: string,
    justification: string
  ): Promise<DangerousModeResult> {
    // Check if user has permission
    if (!(await this.hasPermission(user, Permission.SESSION_DANGEROUS))) {
      throw new SecurityError('User not authorized for dangerous mode');
    }

    // Log the request
    await this.auditLogger.logSecurityEvent({
      userId: user.id,
      sessionId,
      action: SecurityAction.DANGEROUS_MODE_ENABLE,
      resource: 'session',
      result: 'requested',
      metadata: { justification },
    });

    // Require confirmation
    const confirmation = await this.requestConfirmation(user, {
      message: 'Are you sure you want to enable dangerous mode?',
      risks: this.getDangerousModeRisks(),
      timeoutMinutes: 5,
    });

    if (!confirmation.confirmed) {
      return { enabled: false, reason: 'User declined confirmation' };
    }

    // Enable dangerous mode
    const session = this.sessions.get(sessionId);
    session.securityContext.dangerousMode = true;
    session.dangerousModeEnabledAt = new Date();
    session.dangerousModeTimeout = this.calculateTimeout();

    // Set up automatic disable
    this.scheduleDangerousModeDisable(session);

    await this.auditLogger.logSecurityEvent({
      userId: user.id,
      sessionId,
      action: SecurityAction.DANGEROUS_MODE_ENABLE,
      resource: 'session',
      result: 'allowed',
      metadata: {
        justification,
        timeoutAt: session.dangerousModeTimeout,
      },
    });

    return { enabled: true };
  }

  private scheduleDangerousModeDisable(session: SecureSession): void {
    const timeout = session.dangerousModeTimeout!.getTime() - Date.now();

    setTimeout(async () => {
      await this.disableDangerousMode(session.id, 'timeout');
    }, timeout);
  }
}
```

## Security Monitoring

### Real-time Security Monitoring

```typescript
export class SecurityMonitor {
  private alerts = new Map<string, SecurityAlert>();

  async monitorSecurity(): Promise<void> {
    // Monitor for suspicious patterns
    setInterval(async () => {
      await this.checkFailedLogins();
      await this.checkUnusualActivity();
      await this.checkResourceUsage();
      await this.checkDangerousModeUsage();
    }, 10000);
  }

  private async checkFailedLogins(): Promise<void> {
    const recentFailures = await this.getRecentFailedLogins();

    // Group by IP address
    const byIP = groupBy(recentFailures, 'ipAddress');

    for (const [ip, failures] of Object.entries(byIP)) {
      if (failures.length > 5) {
        await this.createAlert({
          type: 'brute_force_attempt',
          severity: 'high',
          description: `Multiple failed login attempts from ${ip}`,
          metadata: { ip, attempts: failures.length },
        });
      }
    }
  }

  private async checkUnusualActivity(session: SecureSession): Promise<void> {
    const activity = await this.getSessionActivity(session.id);

    // Check for rapid command execution
    if (activity.commandsPerMinute > 60) {
      await this.createAlert({
        type: 'unusual_activity',
        severity: 'medium',
        description: 'Unusually high command execution rate',
        sessionId: session.id,
      });
    }

    // Check for file system traversal attempts
    const traversalAttempts = activity.commands.filter(
      cmd => cmd.includes('..') || cmd.includes('~')
    );

    if (traversalAttempts.length > 3) {
      await this.createAlert({
        type: 'directory_traversal',
        severity: 'high',
        description: 'Potential directory traversal attack',
        sessionId: session.id,
      });
    }
  }
}
```

## Encryption & Data Protection

### Data Encryption

```typescript
export class EncryptionService {
  private algorithm = 'aes-256-gcm';
  private keyDerivation = 'pbkdf2';

  async encryptSensitiveData(
    data: string,
    context: string
  ): Promise<EncryptedData> {
    const key = await this.deriveKey(context);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipher(this.algorithm, key);
    cipher.setAAD(Buffer.from(context));

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      data: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      algorithm: this.algorithm,
    };
  }

  async decryptSensitiveData(
    encrypted: EncryptedData,
    context: string
  ): Promise<string> {
    const key = await this.deriveKey(context);

    const decipher = crypto.createDecipher(encrypted.algorithm, key);
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(encrypted.authTag, 'hex'));

    let decrypted = decipher.update(encrypted.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
```

## Security Configuration

### Security Configuration Schema

```typescript
interface SecurityConfig {
  authentication: {
    providers: string[];
    tokenExpiry: number;
    refreshTokenExpiry: number;
    requireMFA: boolean;
  };

  authorization: {
    defaultRole: string;
    roles: Role[];
  };

  sandboxing: {
    enabled: boolean;
    containerRuntime: 'docker' | 'podman';
    defaultRestrictions: SafeModeRestrictions;
  };

  dangerousMode: {
    enabled: boolean;
    defaultTimeout: number;
    requiresApproval: boolean;
    autoDisableOnSuspiciousActivity: boolean;
  };

  audit: {
    enabled: boolean;
    logLevel: 'minimal' | 'standard' | 'verbose';
    retentionDays: number;
    alertOnCritical: boolean;
  };

  monitoring: {
    enabled: boolean;
    checkInterval: number;
    alertThresholds: AlertThresholds;
  };
}
```
