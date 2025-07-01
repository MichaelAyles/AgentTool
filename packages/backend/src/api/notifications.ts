import { Router } from 'express';
import { authenticate } from '../auth/middleware.js';
import { requireAdmin } from '../auth/permissions.js';
import { securityNotificationService, NotificationType, NotificationPriority, DeliveryMethod } from '../dangerous/notifications.js';
import { comprehensiveAuditLogger, AuditCategory } from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';

// Simple input sanitization function
const sanitizeInput = (input: string): string => {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
};

const router = Router();

/**
 * Get notifications for the authenticated user
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;
    const {
      includeAcknowledged = 'false',
      limit = '50',
      since,
      types,
    } = req.query;

    const options = {
      includeAcknowledged: includeAcknowledged === 'true',
      limit: Math.min(parseInt(limit as string) || 50, 100),
      sinceTimestamp: since ? new Date(since as string) : undefined,
      types: types ? (types as string).split(',') as NotificationType[] : undefined,
    };

    const notifications = securityNotificationService.getNotificationsForUser(userId, options);

    res.json({
      success: true,
      notifications,
      count: notifications.length,
    });
  } catch (error) {
    console.error('Error getting notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get notifications',
    });
  }
});

/**
 * Acknowledge a notification
 */
router.post('/:notificationId/acknowledge', authenticate, async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID required',
      });
    }

    const success = await securityNotificationService.acknowledgeNotification(
      sanitizeInput(notificationId),
      userId
    );

    if (!success) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found or already acknowledged',
      });
    }

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SECURITY_EVENTS,
      action: 'notification_acknowledged',
      resourceType: 'security_notification',
      resourceId: notificationId,
      userId,
      sessionId: req.session?.id || req.sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        notificationId,
        acknowledgedAt: new Date().toISOString(),
      },
    });

    res.json({
      success: true,
      message: 'Notification acknowledged',
    });
  } catch (error) {
    console.error('Error acknowledging notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to acknowledge notification',
    });
  }
});

/**
 * Get notification statistics (admin only)
 */
router.get('/stats', authenticate, requireAdmin(), async (req, res) => {
  try {
    const stats = securityNotificationService.getNotificationStats();

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('Error getting notification stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get notification statistics',
    });
  }
});

/**
 * Send a test notification (admin only)
 */
router.post('/test', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { type, title, message, userId, priority = 'medium' } = req.body;
    const adminUserId = req.user?.id;

    if (!type || !title || !message) {
      return res.status(400).json({
        success: false,
        message: 'Type, title, and message are required',
      });
    }

    // Validate notification type
    if (!Object.values(NotificationType).includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification type',
      });
    }

    // Validate priority
    if (!Object.values(NotificationPriority).includes(priority)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid priority level',
      });
    }

    // Create test notification using the internal method
    const notification = await (securityNotificationService as any).createNotification({
      type: type as NotificationType,
      title: sanitizeInput(title),
      message: sanitizeInput(message),
      details: {
        isTest: true,
        createdBy: adminUserId,
        timestamp: new Date().toISOString(),
      },
      priority: priority as NotificationPriority,
      severity: SecurityLevel.SAFE,
      userId: userId ? sanitizeInput(userId) : undefined,
    });

    await (securityNotificationService as any).deliverNotification(notification);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.SECURITY_EVENTS,
      action: 'test_notification_sent',
      resourceType: 'security_notification',
      resourceId: notification.id,
      userId: adminUserId,
      sessionId: req.session?.id || req.sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        notificationType: type,
        targetUserId: userId,
        title,
        message,
      },
    });

    res.json({
      success: true,
      message: 'Test notification sent',
      notificationId: notification.id,
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test notification',
    });
  }
});

/**
 * Register a notification recipient (admin only)
 */
router.post('/recipients', authenticate, requireAdmin(), async (req, res) => {
  try {
    const {
      id,
      name,
      email,
      phone,
      slackUserId,
      webhookUrl,
      deliveryPreferences,
      roles,
    } = req.body;
    const adminUserId = req.user?.id;

    if (!id || !name || !deliveryPreferences || !roles) {
      return res.status(400).json({
        success: false,
        message: 'ID, name, delivery preferences, and roles are required',
      });
    }

    // Validate delivery preferences
    const { types, methods, minPriority } = deliveryPreferences;
    
    if (!types || !Array.isArray(types) || !methods || !Array.isArray(methods) || !minPriority) {
      return res.status(400).json({
        success: false,
        message: 'Invalid delivery preferences format',
      });
    }

    // Validate notification types
    const invalidTypes = types.filter((type: string) => !Object.values(NotificationType).includes(type as NotificationType));
    if (invalidTypes.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid notification types: ${invalidTypes.join(', ')}`,
      });
    }

    // Validate delivery methods
    const invalidMethods = methods.filter((method: string) => !Object.values(DeliveryMethod).includes(method as DeliveryMethod));
    if (invalidMethods.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid delivery methods: ${invalidMethods.join(', ')}`,
      });
    }

    // Validate priority
    if (!Object.values(NotificationPriority).includes(minPriority)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid minimum priority',
      });
    }

    const recipient = {
      id: sanitizeInput(id),
      name: sanitizeInput(name),
      email: email ? sanitizeInput(email) : undefined,
      phone: phone ? sanitizeInput(phone) : undefined,
      slackUserId: slackUserId ? sanitizeInput(slackUserId) : undefined,
      webhookUrl: webhookUrl ? sanitizeInput(webhookUrl) : undefined,
      deliveryPreferences: {
        types: types as NotificationType[],
        methods: methods as DeliveryMethod[],
        minPriority: minPriority as NotificationPriority,
        quietHours: deliveryPreferences.quietHours,
        timezone: deliveryPreferences.timezone,
      },
      roles: roles.map((role: string) => sanitizeInput(role)),
      isActive: true,
    };

    securityNotificationService.registerRecipient(recipient);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.CONFIGURATION,
      action: 'notification_recipient_registered',
      resourceType: 'notification_recipient',
      resourceId: recipient.id,
      userId: adminUserId,
      sessionId: req.session?.id || req.sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        recipientId: recipient.id,
        recipientName: recipient.name,
        deliveryMethods: recipient.deliveryPreferences.methods,
        roles: recipient.roles,
      },
    });

    res.json({
      success: true,
      message: 'Notification recipient registered',
      recipient: {
        id: recipient.id,
        name: recipient.name,
        deliveryPreferences: recipient.deliveryPreferences,
        roles: recipient.roles,
      },
    });
  } catch (error) {
    console.error('Error registering notification recipient:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register notification recipient',
    });
  }
});

/**
 * Update notification configuration (admin only)
 */
router.post('/config/:type', authenticate, requireAdmin(), async (req, res) => {
  try {
    const { type } = req.params;
    const config = req.body;
    const adminUserId = req.user?.id;

    // Validate notification type
    if (!Object.values(NotificationType).includes(type as NotificationType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification type',
      });
    }

    // Validate configuration fields
    if (config.enabled !== undefined && typeof config.enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'enabled must be a boolean',
      });
    }

    if (config.deliveryMethods) {
      const invalidMethods = config.deliveryMethods.filter((method: string) => 
        !Object.values(DeliveryMethod).includes(method as DeliveryMethod)
      );
      if (invalidMethods.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid delivery methods: ${invalidMethods.join(', ')}`,
        });
      }
    }

    if (config.priority && !Object.values(NotificationPriority).includes(config.priority)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid priority level',
      });
    }

    securityNotificationService.updateConfiguration(type as NotificationType, config);

    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.CONFIGURATION,
      action: 'notification_config_updated',
      resourceType: 'notification_configuration',
      resourceId: type,
      userId: adminUserId,
      sessionId: req.session?.id || req.sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        notificationType: type,
        updatedConfig: config,
      },
    });

    res.json({
      success: true,
      message: 'Notification configuration updated',
    });
  } catch (error) {
    console.error('Error updating notification configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update notification configuration',
    });
  }
});

/**
 * Get available notification types and priorities
 */
router.get('/metadata', authenticate, (req, res) => {
  res.json({
    success: true,
    metadata: {
      types: Object.values(NotificationType),
      priorities: Object.values(NotificationPriority),
      deliveryMethods: Object.values(DeliveryMethod),
    },
  });
});

/**
 * WebSocket/SSE endpoint for real-time notifications
 */
router.get('/stream', authenticate, (req, res) => {
  const userId = req.user?.id;
  
  // Set up Server-Sent Events
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial connection confirmation
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

  // Listen for real-time notifications
  const handleNotification = (notification: any) => {
    // Only send notifications for this user or global notifications
    if (!notification.userId || notification.userId === userId) {
      res.write(`data: ${JSON.stringify({
        type: 'notification',
        notification: {
          id: notification.id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          priority: notification.priority,
          severity: notification.severity,
          timestamp: notification.timestamp,
        }
      })}\n\n`);
    }
  };

  securityNotificationService.on('realTimeNotification', handleNotification);

  // Clean up on client disconnect
  req.on('close', () => {
    securityNotificationService.removeListener('realTimeNotification', handleNotification);
  });
});

export default router;