import { UserRole } from '../auth/types.js';

// Security risk levels
export enum SecurityLevel {
  SAFE = 'safe',
  MODERATE = 'moderate', 
  DANGEROUS = 'dangerous',
  CRITICAL = 'critical'
}

// Security event types
export enum SecurityEventType {
  // Authentication events
  LOGIN = 'login',
  LOGOUT = 'logout',
  LOGIN_FAILED = 'login_failed',
  SESSION_EXPIRED = 'session_expired',
  
  // Authorization events
  ACCESS_GRANTED = 'access_granted',
  ACCESS_DENIED = 'access_denied',
  PERMISSION_ESCALATION = 'permission_escalation',
  
  // Resource access events
  RESOURCE_ACCESS = 'resource_access',
  RESOURCE_MODIFIED = 'resource_modified',
  RESOURCE_DELETED = 'resource_deleted',
  
  // Dangerous operations
  DANGEROUS_MODE_ENABLED = 'dangerous_mode_enabled',
  DANGEROUS_MODE_DISABLED = 'dangerous_mode_disabled',
  DANGEROUS_COMMAND_EXECUTED = 'dangerous_command_executed',
  
  // System events
  CONFIGURATION_CHANGED = 'configuration_changed',
  SECURITY_VIOLATION = 'security_violation',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  
  // Process events
  PROCESS_STARTED = 'process_started',
  PROCESS_TERMINATED = 'process_terminated',
  PROCESS_LIMIT_EXCEEDED = 'process_limit_exceeded'
}

// Security context for a user session
export interface SecurityContext {
  // User identification
  userId: string;
  sessionId: string;
  role: UserRole;
  
  // Session metadata
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
  lastActivity: Date;
  
  // Security state
  dangerousModeEnabled: boolean;
  dangerousModeEnabledAt?: Date;
  securityLevel: SecurityLevel;
  
  // Active resources and permissions
  activeProjects: string[];
  activeSessions: string[];
  grantedPermissions: string[];
  
  // Security tracking
  riskScore: number;
  violationCount: number;
  lastViolation?: Date;
  
  // Rate limiting
  requestCount: number;
  requestWindowStart: Date;
  
  // Geographic and device info
  location?: {
    country?: string;
    region?: string;
    city?: string;
  };
  device?: {
    type: string;
    os: string;
    browser?: string;
  };
}

// Security event structure
export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  severity: SecurityLevel;
  timestamp: Date;
  
  // Context
  userId: string;
  sessionId: string;
  ipAddress: string;
  
  // Event details
  resource?: string;
  action?: string;
  outcome: 'success' | 'failure' | 'blocked';
  
  // Additional data
  metadata: Record<string, any>;
  riskScore?: number;
  
  // Forensics
  userAgent?: string;
  location?: string;
  stackTrace?: string;
}

// Security policy configuration
export interface SecurityPolicy {
  // Rate limiting
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
  
  // Session limits
  maxSessionDuration: number;
  maxConcurrentSessions: number;
  
  // Dangerous mode
  dangerousModeTimeout: number;
  dangerousModeRequiresConfirmation: boolean;
  
  // Risk scoring
  maxRiskScore: number;
  riskScoreDecayRate: number;
  
  // Violation handling
  maxViolationsPerHour: number;
  violationLockoutDuration: number;
  
  // Resource limits
  maxActiveProjects: number;
  maxActiveProcesses: number;
  
  // Geographic restrictions
  allowedCountries?: string[];
  blockedCountries?: string[];
}

// Security alert configuration
export interface SecurityAlert {
  id: string;
  name: string;
  description: string;
  severity: SecurityLevel;
  enabled: boolean;
  
  // Trigger conditions
  eventTypes: SecurityEventType[];
  threshold: number;
  timeWindow: number; // in minutes
  
  // Actions
  actions: SecurityAlertAction[];
}

export interface SecurityAlertAction {
  type: 'email' | 'webhook' | 'disable_user' | 'terminate_session' | 'log';
  config: Record<string, any>;
}

// Security audit log entry
export interface SecurityAuditLog {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'critical';
  
  // Event classification
  category: 'auth' | 'access' | 'resource' | 'system' | 'violation';
  event: SecurityEventType;
  
  // Context
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  
  // Details
  message: string;
  data: Record<string, any>;
  
  // Tracking
  correlationId?: string;
  requestId?: string;
}

// Security metrics for monitoring
export interface SecurityMetrics {
  timestamp: Date;
  
  // User activity
  activeUsers: number;
  activeSessions: number;
  
  // Events per type
  eventCounts: Record<SecurityEventType, number>;
  
  // Risk distribution
  riskScoreDistribution: {
    low: number;
    medium: number; 
    high: number;
    critical: number;
  };
  
  // Violations
  violationsPerHour: number;
  blockedRequests: number;
  
  // Performance
  avgResponseTime: number;
  errorRate: number;
}