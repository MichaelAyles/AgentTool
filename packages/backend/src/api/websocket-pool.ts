import { Router } from 'express';
import { authenticate } from '../auth/middleware.js';
import { requireAdmin, requirePermission } from '../auth/permissions.js';
import { getConnectionPool } from '../websocket/connection-pool.js';
import { comprehensiveAuditLogger, AuditCategory } from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';

const router = Router();

// Simple input sanitization function
const sanitizeInput = (input: string): string => {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
};

/**
 * Get connection pool statistics
 */
router.get('/stats', authenticate, requirePermission('websocket', 'read'), async (req, res) => {
  try {
    const connectionPool = getConnectionPool();
    const stats = connectionPool.getStatistics();

    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting connection pool stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get connection pool statistics',
    });
  }
});

/**
 * Get all active connections (admin only)
 */
router.get('/connections', authenticate, requireAdmin(), async (req, res) => {
  try {
    const connectionPool = getConnectionPool();
    const stats = connectionPool.getStatistics();

    // Get summary information about connections (not full details for privacy)
    const connectionSummary = {
      totalConnections: stats.totalConnections,
      activeConnections: stats.activeConnections,
      authenticatedConnections: stats.authenticatedConnections,
      connectionsByType: stats.connectionsByType,
      connectionsByQuality: stats.connectionsByQuality,
      connectionsPerUser: stats.connectionsPerUser,
      connectionsPerIP: stats.connectionsPerIP,
    };

    res.json({
      success: true,
      connections: connectionSummary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting connections:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get connections',
    });
  }
});

/**
 * Get connection details by socket ID (admin only)
 */
router.get('/connections/:socketId', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { socketId } = req.params;
    const sanitizedSocketId = sanitizeInput(socketId);
    const connectionPool = getConnectionPool();

    const connection = connectionPool.getConnection(sanitizedSocketId);

    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'Connection not found',
      });
    }

    // Return connection details (be careful about sensitive information)
    const connectionDetails = {
      socketId: connection.socketId,
      userId: connection.userId,
      sessionId: connection.sessionId,
      connectedAt: connection.connectedAt,
      lastActivity: connection.lastActivity,
      messageCount: connection.messageCount,
      dataTransferred: connection.dataTransferred,
      isAuthenticated: connection.isAuthenticated,
      connectionQuality: connection.connectionQuality,
      pingLatency: connection.pingLatency,
      connectionType: connection.connectionType,
      roomsJoined: Array.from(connection.roomsJoined),
    };

    res.json({
      success: true,
      connection: connectionDetails,
    });
  } catch (error) {
    console.error('Error getting connection details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get connection details',
    });
  }
});

/**
 * Get connections for a specific user
 */
router.get('/users/:userId/connections', authenticate, requirePermission('websocket', 'read'), async (req, res) => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user?.id;
    const sanitizedUserId = sanitizeInput(userId);

    // Users can only see their own connections unless they're admin
    if (sanitizedUserId !== requestingUserId && !req.user?.role?.includes('admin')) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
    }

    const connectionPool = getConnectionPool();
    const userConnections = connectionPool.getUserConnections(sanitizedUserId);

    const connectionSummaries = userConnections.map(conn => ({
      socketId: conn.socketId,
      connectedAt: conn.connectedAt,
      lastActivity: conn.lastActivity,
      connectionQuality: conn.connectionQuality,
      connectionType: conn.connectionType,
      messageCount: conn.messageCount,
      dataTransferred: conn.dataTransferred,
    }));

    res.json({
      success: true,
      userId: sanitizedUserId,
      connections: connectionSummaries,
      count: connectionSummaries.length,
    });
  } catch (error) {
    console.error('Error getting user connections:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user connections',
    });
  }
});

/**
 * Disconnect a specific connection (admin only)
 */
router.delete('/connections/:socketId', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { socketId } = req.params;
    const { reason = 'admin_disconnect' } = req.body;
    const userId = req.user?.id;
    const sanitizedSocketId = sanitizeInput(socketId);
    const sanitizedReason = sanitizeInput(reason);

    const connectionPool = getConnectionPool();
    const connection = connectionPool.getConnection(sanitizedSocketId);

    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'Connection not found',
      });
    }

    const success = await connectionPool.removeConnection(sanitizedSocketId, sanitizedReason);

    if (!success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to disconnect connection',
      });
    }

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'websocket_connection_disconnected',
      resourceType: 'websocket_connection',
      resourceId: sanitizedSocketId,
      userId,
      sessionId: req.session?.id || req.sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.MODERATE,
      details: {
        targetSocketId: sanitizedSocketId,
        targetUserId: connection.userId,
        reason: sanitizedReason,
        connectionDuration: Date.now() - connection.connectedAt.getTime(),
      },
    });

    res.json({
      success: true,
      message: 'Connection disconnected successfully',
      socketId: sanitizedSocketId,
      reason: sanitizedReason,
    });
  } catch (error) {
    console.error('Error disconnecting connection:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to disconnect connection',
    });
  }
});

/**
 * Cleanup idle connections (admin only)
 */
router.post('/cleanup', authenticate, requireAdmin(), async (req, res) => {
  try {
    const userId = req.user?.id;
    const connectionPool = getConnectionPool();
    
    const removedCount = connectionPool.cleanupIdleConnections();

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SYSTEM_CHANGES,
      action: 'websocket_connections_cleaned',
      resourceType: 'websocket_pool',
      userId,
      sessionId: req.session?.id || req.sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        removedConnections: removedCount,
      },
    });

    res.json({
      success: true,
      message: `Cleaned up ${removedCount} idle connections`,
      removedCount,
    });
  } catch (error) {
    console.error('Error cleaning up connections:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup connections',
    });
  }
});

/**
 * Get connection pool health status
 */
router.get('/health', authenticate, requirePermission('websocket', 'read'), async (req, res) => {
  try {
    const connectionPool = getConnectionPool();
    const stats = connectionPool.getStatistics();

    // Calculate health metrics
    const healthStatus = {
      healthy: stats.poolEfficiency < 0.9, // Pool is healthy if less than 90% full
      poolEfficiency: stats.poolEfficiency,
      averagePingLatency: stats.averagePingLatency,
      totalConnections: stats.totalConnections,
      activeConnections: stats.activeConnections,
      uptime: stats.uptime,
      issues: [] as string[],
    };

    // Check for potential issues
    if (stats.poolEfficiency > 0.9) {
      healthStatus.issues.push('Pool efficiency high - approaching capacity');
    }
    
    if (stats.averagePingLatency > 200) {
      healthStatus.issues.push('High average ping latency detected');
    }

    if (stats.totalConnections === 0) {
      healthStatus.issues.push('No active connections');
    }

    // Overall health
    healthStatus.healthy = healthStatus.issues.length === 0;

    res.json({
      success: true,
      health: healthStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting pool health:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get pool health status',
    });
  }
});

/**
 * Get WebSocket connection pool configuration (admin only)
 */
router.get('/config', authenticate, requireAdmin(), async (req, res) => {
  try {
    // Return safe configuration info (no sensitive data)
    const config = {
      maxConnections: 1000, // This should come from actual config
      maxConnectionsPerUser: 10,
      maxConnectionsPerIP: 50,
      enableCompression: true,
      enableRateLimiting: true,
      pingInterval: 25000,
      idleTimeout: 300000,
    };

    res.json({
      success: true,
      config,
    });
  } catch (error) {
    console.error('Error getting pool config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get pool configuration',
    });
  }
});

export default router;