import { Router } from 'express';
import { authenticate } from '../auth/middleware.js';
import { requireAdmin, requirePermission } from '../auth/permissions.js';
import {
  processQueueManager,
  JobType,
  JobPriority,
  JobStatus,
} from '../queue/index.js';
import {
  comprehensiveAuditLogger,
  AuditCategory,
} from '../security/audit-logger.js';
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
 * Get queue system status
 */
router.get(
  '/status',
  authenticate,
  requirePermission('system', 'read'),
  async (req, res) => {
    try {
      const systemStats = await processQueueManager.getSystemStats();

      res.json({
        success: true,
        status: systemStats,
      });
    } catch (error) {
      console.error('Error getting queue status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get queue status',
      });
    }
  }
);

/**
 * Get metrics for all queues or a specific queue
 */
router.get(
  '/metrics/:jobType?',
  authenticate,
  requirePermission('system', 'read'),
  async (req, res) => {
    try {
      const { jobType } = req.params;

      if (jobType && !Object.values(JobType).includes(jobType as JobType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid job type',
        });
      }

      const metrics = await processQueueManager.getQueueMetrics(
        jobType as JobType
      );

      res.json({
        success: true,
        metrics: jobType
          ? metrics
          : Object.fromEntries(metrics as Map<JobType, any>),
      });
    } catch (error) {
      console.error('Error getting queue metrics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get queue metrics',
      });
    }
  }
);

/**
 * Get queue status for a specific job type
 */
router.get(
  '/:jobType/status',
  authenticate,
  requirePermission('system', 'read'),
  async (req, res) => {
    try {
      const { jobType } = req.params;

      if (!Object.values(JobType).includes(jobType as JobType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid job type',
        });
      }

      const status = await processQueueManager.getQueueStatus(
        jobType as JobType
      );

      if (!status) {
        return res.status(404).json({
          success: false,
          message: 'Queue not found',
        });
      }

      res.json({
        success: true,
        status,
      });
    } catch (error) {
      console.error('Error getting queue status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get queue status',
      });
    }
  }
);

/**
 * Get jobs by status for a specific queue
 */
router.get(
  '/:jobType/jobs/:status',
  authenticate,
  requirePermission('system', 'read'),
  async (req, res) => {
    try {
      const { jobType, status } = req.params;
      const { start = '0', end = '50' } = req.query;

      if (!Object.values(JobType).includes(jobType as JobType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid job type',
        });
      }

      if (!Object.values(JobStatus).includes(status as JobStatus)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid job status',
        });
      }

      const startIndex = Math.max(0, parseInt(start as string) || 0);
      const endIndex = Math.min(1000, parseInt(end as string) || 50);

      const jobs = await processQueueManager.getJobs(
        jobType as JobType,
        status as JobStatus,
        startIndex,
        endIndex
      );

      const jobData = jobs.map(job => ({
        id: job.id,
        name: job.name,
        data: job.data,
        opts: job.opts,
        progress: job.progress,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        failedReason: job.failedReason,
        returnvalue: job.returnvalue,
      }));

      res.json({
        success: true,
        jobs: jobData,
        count: jobData.length,
        range: { start: startIndex, end: endIndex },
      });
    } catch (error) {
      console.error('Error getting jobs:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get jobs',
      });
    }
  }
);

/**
 * Add a job to a queue
 */
router.post(
  '/:jobType/jobs',
  authenticate,
  requirePermission('system', 'write'),
  async (req, res) => {
    try {
      const { jobType } = req.params;
      const { data, options = {} } = req.body;
      const userId = req.user?.id;

      if (!Object.values(JobType).includes(jobType as JobType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid job type',
        });
      }

      if (!data || typeof data !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'Job data is required',
        });
      }

      // Sanitize job data
      const sanitizedData = {
        ...data,
        type: jobType as JobType,
        userId,
        priority: options.priority || JobPriority.NORMAL,
        metadata: {
          ...data.metadata,
          createdBy: userId,
          createdAt: new Date().toISOString(),
        },
      };

      // Validate priority if provided
      if (
        options.priority &&
        !Object.values(JobPriority).includes(options.priority)
      ) {
        return res.status(400).json({
          success: false,
          message: 'Invalid job priority',
        });
      }

      const job = await processQueueManager.addJob(
        jobType as JobType,
        sanitizedData,
        options
      );

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'job_added',
        resourceType: 'queue_job',
        resourceId: job.id?.toString(),
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.SAFE,
        details: {
          jobType,
          jobId: job.id,
          priority: options.priority || JobPriority.NORMAL,
          delay: options.delay,
        },
      });

      res.status(201).json({
        success: true,
        job: {
          id: job.id,
          name: job.name,
          data: job.data,
          opts: job.opts,
        },
      });
    } catch (error) {
      console.error('Error adding job:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to add job',
      });
    }
  }
);

/**
 * Get a specific job
 */
router.get(
  '/:jobType/jobs/:jobId',
  authenticate,
  requirePermission('system', 'read'),
  async (req, res) => {
    try {
      const { jobType, jobId } = req.params;

      if (!Object.values(JobType).includes(jobType as JobType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid job type',
        });
      }

      const job = await processQueueManager.getJob(
        jobType as JobType,
        sanitizeInput(jobId)
      );

      if (!job) {
        return res.status(404).json({
          success: false,
          message: 'Job not found',
        });
      }

      res.json({
        success: true,
        job: {
          id: job.id,
          name: job.name,
          data: job.data,
          opts: job.opts,
          progress: job.progress,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
          failedReason: job.failedReason,
          returnvalue: job.returnvalue,
        },
      });
    } catch (error) {
      console.error('Error getting job:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get job',
      });
    }
  }
);

/**
 * Cancel a job
 */
router.delete(
  '/:jobType/jobs/:jobId',
  authenticate,
  requirePermission('system', 'write'),
  async (req, res) => {
    try {
      const { jobType, jobId } = req.params;
      const userId = req.user?.id;

      if (!Object.values(JobType).includes(jobType as JobType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid job type',
        });
      }

      const success = await processQueueManager.cancelJob(
        jobType as JobType,
        sanitizeInput(jobId)
      );

      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'Job not found or could not be cancelled',
        });
      }

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'job_cancelled',
        resourceType: 'queue_job',
        resourceId: jobId,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.MODERATE,
        details: {
          jobType,
          jobId,
        },
      });

      res.json({
        success: true,
        message: 'Job cancelled successfully',
      });
    } catch (error) {
      console.error('Error cancelling job:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cancel job',
      });
    }
  }
);

/**
 * Retry a failed job
 */
router.post(
  '/:jobType/jobs/:jobId/retry',
  authenticate,
  requirePermission('system', 'write'),
  async (req, res) => {
    try {
      const { jobType, jobId } = req.params;
      const userId = req.user?.id;

      if (!Object.values(JobType).includes(jobType as JobType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid job type',
        });
      }

      const success = await processQueueManager.retryJob(
        jobType as JobType,
        sanitizeInput(jobId)
      );

      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'Job not found or could not be retried',
        });
      }

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'job_retried',
        resourceType: 'queue_job',
        resourceId: jobId,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.SAFE,
        details: {
          jobType,
          jobId,
        },
      });

      res.json({
        success: true,
        message: 'Job retried successfully',
      });
    } catch (error) {
      console.error('Error retrying job:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retry job',
      });
    }
  }
);

/**
 * Pause a queue (admin only)
 */
router.post(
  '/:jobType/pause',
  authenticate,
  requireAdmin(),
  async (req, res) => {
    try {
      const { jobType } = req.params;
      const userId = req.user?.id;

      if (!Object.values(JobType).includes(jobType as JobType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid job type',
        });
      }

      await processQueueManager.pauseQueue(jobType as JobType);

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'queue_paused',
        resourceType: 'queue',
        resourceId: jobType,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.MODERATE,
        details: {
          jobType,
        },
      });

      res.json({
        success: true,
        message: 'Queue paused successfully',
      });
    } catch (error) {
      console.error('Error pausing queue:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to pause queue',
      });
    }
  }
);

/**
 * Resume a queue (admin only)
 */
router.post(
  '/:jobType/resume',
  authenticate,
  requireAdmin(),
  async (req, res) => {
    try {
      const { jobType } = req.params;
      const userId = req.user?.id;

      if (!Object.values(JobType).includes(jobType as JobType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid job type',
        });
      }

      await processQueueManager.resumeQueue(jobType as JobType);

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'queue_resumed',
        resourceType: 'queue',
        resourceId: jobType,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.SAFE,
        details: {
          jobType,
        },
      });

      res.json({
        success: true,
        message: 'Queue resumed successfully',
      });
    } catch (error) {
      console.error('Error resuming queue:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to resume queue',
      });
    }
  }
);

/**
 * Clean old jobs (admin only)
 */
router.post(
  '/:jobType/clean',
  authenticate,
  requireAdmin(),
  async (req, res) => {
    try {
      const { jobType } = req.params;
      const { grace = 86400000, status = 'completed' } = req.body; // Default 24 hours
      const userId = req.user?.id;

      if (!Object.values(JobType).includes(jobType as JobType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid job type',
        });
      }

      if (status !== 'completed' && status !== 'failed') {
        return res.status(400).json({
          success: false,
          message: 'Status must be "completed" or "failed"',
        });
      }

      const cleaned = await processQueueManager.cleanOldJobs(
        jobType as JobType,
        parseInt(grace.toString()),
        status as 'completed' | 'failed'
      );

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'queue_cleaned',
        resourceType: 'queue',
        resourceId: jobType,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.SAFE,
        details: {
          jobType,
          cleaned,
          grace,
          status,
        },
      });

      res.json({
        success: true,
        message: `Cleaned ${cleaned} old jobs`,
        cleaned,
      });
    } catch (error) {
      console.error('Error cleaning jobs:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to clean old jobs',
      });
    }
  }
);

/**
 * Get available job types and priorities
 */
router.get('/metadata', authenticate, (req, res) => {
  res.json({
    success: true,
    metadata: {
      jobTypes: Object.values(JobType),
      jobPriorities: Object.values(JobPriority),
      jobStatuses: Object.values(JobStatus),
    },
  });
});

export default router;
