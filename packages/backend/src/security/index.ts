// Export all security types
export * from './types.js';

// Export security components
export { SecurityContextManager, securityContextManager } from './context-manager.js';
export { SecuritySessionTracker, createSecuritySessionTracker } from './session-tracker.js';
export { SecurityEventLogger, securityEventLogger } from './event-logger.js';

// Export middleware
export {
  initializeSecurityMiddleware,
  securityTrackingMiddleware,
  securityAuditMiddleware,
  requireDangerousMode,
  blockHighRiskUsers,
  securityRateLimit,
  trackResourceAccess,
  securityHeaders,
  validateCommand,
} from './middleware.js';

// Export convenience functions
export function createSecurityStack(database: any) {
  return {
    initialize: initializeSecurityMiddleware(database),
    tracking: securityTrackingMiddleware(),
    audit: securityAuditMiddleware(),
    headers: securityHeaders(),
  };
}

export function createResourceTracker(resourceType: string, actionType?: string) {
  return trackResourceAccess(resourceType, actionType);
}