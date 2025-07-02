import { Queue, Worker, Job, QueueEvents, ConnectionOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import { structuredLogger } from '../middleware/logging.js';

// Queue configuration
export interface QueueConfig {
  redis: ConnectionOptions;
  defaultJobOptions: {
    removeOnComplete: number;
    removeOnFail: number;
    attempts: number;
    backoff: {
      type: 'exponential';
      delay: number;
    };
  };
  concurrency: {
    [key: string]: number;
  };
}

// Job types
export enum JobType {
  PROCESS_EXECUTION = 'process_execution',
  ADAPTER_OPERATION = 'adapter_operation',
  GIT_OPERATION = 'git_operation',
  FILE_OPERATION = 'file_operation',
  SECURITY_SCAN = 'security_scan',
  CLEANUP_TASK = 'cleanup_task',
  NOTIFICATION_DELIVERY = 'notification_delivery',
  SYSTEM_MAINTENANCE = 'system_maintenance',
}

// Job priorities
export enum JobPriority {
  LOW = 1,
  NORMAL = 5,
  HIGH = 10,
  CRITICAL = 20,
  EMERGENCY = 50,
}

// Job status
export enum JobStatus {
  WAITING = 'waiting',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DELAYED = 'delayed',
  PAUSED = 'paused',
}

// Base job data interface
export interface BaseJobData {
  type: JobType;
  sessionId?: string;
  userId?: string;
  priority: JobPriority;
  metadata: Record<string, any>;
  timeout?: number;
  retryCount?: number;
}

// Process execution job data
export interface ProcessExecutionJobData extends BaseJobData {
  type: JobType.PROCESS_EXECUTION;
  command: string;
  args: string[];
  workingDirectory: string;
  environment: Record<string, string>;
  adapterName: string;
  dangerousModeEnabled: boolean;
}

// Adapter operation job data
export interface AdapterOperationJobData extends BaseJobData {
  type: JobType.ADAPTER_OPERATION;
  adapterName: string;
  operation: 'install' | 'uninstall' | 'update' | 'configure' | 'validate';
  operationData: Record<string, any>;
}

// Git operation job data
export interface GitOperationJobData extends BaseJobData {
  type: JobType.GIT_OPERATION;
  operation: 'clone' | 'pull' | 'push' | 'commit' | 'branch' | 'merge';
  repositoryPath: string;
  operationData: Record<string, any>;
}

// Job result interface
export interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
  metadata: Record<string, any>;
}

// Queue metrics
export interface QueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
  totalProcessed: number;
  processingRate: number;
  averageProcessingTime: number;
  errorRate: number;
}

const DEFAULT_CONFIG: QueueConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
  },
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
  concurrency: {
    [JobType.PROCESS_EXECUTION]: 5,
    [JobType.ADAPTER_OPERATION]: 2,
    [JobType.GIT_OPERATION]: 3,
    [JobType.FILE_OPERATION]: 4,
    [JobType.SECURITY_SCAN]: 2,
    [JobType.CLEANUP_TASK]: 1,
    [JobType.NOTIFICATION_DELIVERY]: 10,
    [JobType.SYSTEM_MAINTENANCE]: 1,
  },
};

export class ProcessQueueManager extends EventEmitter {
  private config: QueueConfig;
  private redis: Redis;
  private queues: Map<JobType, Queue> = new Map();
  private workers: Map<JobType, Worker> = new Map();
  private queueEvents: Map<JobType, QueueEvents> = new Map();
  private jobHandlers: Map<JobType, (job: Job) => Promise<JobResult>> =
    new Map();
  private metrics: Map<JobType, QueueMetrics> = new Map();
  private metricsInterval?: NodeJS.Timeout;
  private isInitialized = false;

  constructor(config: Partial<QueueConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.redis = new Redis(this.config.redis);
    this.setupJobHandlers();
  }

  /**
   * Initialize the queue system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Test Redis connection
      await this.redis.ping();
      structuredLogger.info('Redis connection established');

      // Create queues and workers for each job type
      for (const jobType of Object.values(JobType)) {
        await this.createQueueAndWorker(jobType);
      }

      // Start metrics collection
      this.startMetricsCollection();

      // Setup cleanup on shutdown
      this.setupGracefulShutdown();

      this.isInitialized = true;
      structuredLogger.info('Process queue system initialized');
      this.emit('initialized');
    } catch (error) {
      structuredLogger.error(
        'Failed to initialize queue system',
        error as Error
      );
      throw error;
    }
  }

  /**
   * Add a job to the queue
   */
  async addJob<T extends BaseJobData>(
    jobType: JobType,
    data: T,
    options: {
      delay?: number;
      priority?: JobPriority;
      attempts?: number;
      timeout?: number;
    } = {}
  ): Promise<Job<T>> {
    const queue = this.queues.get(jobType);
    if (!queue) {
      throw new Error(`Queue for job type ${jobType} not found`);
    }

    const jobOptions = {
      ...this.config.defaultJobOptions,
      priority: options.priority || data.priority,
      delay: options.delay,
      attempts: options.attempts,
      timeout: options.timeout || data.timeout,
    };

    const job = await queue.add(jobType, data, jobOptions);

    structuredLogger.info('Job added to queue', {
      jobId: job.id,
      jobType,
      priority: jobOptions.priority,
      sessionId: data.sessionId,
      userId: data.userId,
    });

    this.emit('jobAdded', { jobType, job, data });
    return job;
  }

  /**
   * Get job by ID
   */
  async getJob(jobType: JobType, jobId: string): Promise<Job | null> {
    const queue = this.queues.get(jobType);
    if (!queue) {
      return null;
    }

    return await queue.getJob(jobId);
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobType: JobType, jobId: string): Promise<boolean> {
    const job = await this.getJob(jobType, jobId);
    if (!job) {
      return false;
    }

    try {
      await job.remove();
      structuredLogger.info('Job cancelled', { jobId, jobType });
      this.emit('jobCancelled', { jobType, jobId });
      return true;
    } catch (error) {
      structuredLogger.error('Failed to cancel job', error as Error, {
        jobId,
        jobType,
      });
      return false;
    }
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobType: JobType, jobId: string): Promise<boolean> {
    const job = await this.getJob(jobType, jobId);
    if (!job) {
      return false;
    }

    try {
      await job.retry();
      structuredLogger.info('Job retried', { jobId, jobType });
      this.emit('jobRetried', { jobType, jobId });
      return true;
    } catch (error) {
      structuredLogger.error('Failed to retry job', error as Error, {
        jobId,
        jobType,
      });
      return false;
    }
  }

  /**
   * Pause a queue
   */
  async pauseQueue(jobType: JobType): Promise<void> {
    const queue = this.queues.get(jobType);
    if (queue) {
      await queue.pause();
      structuredLogger.info('Queue paused', { jobType });
      this.emit('queuePaused', { jobType });
    }
  }

  /**
   * Resume a queue
   */
  async resumeQueue(jobType: JobType): Promise<void> {
    const queue = this.queues.get(jobType);
    if (queue) {
      await queue.resume();
      structuredLogger.info('Queue resumed', { jobType });
      this.emit('queueResumed', { jobType });
    }
  }

  /**
   * Get queue metrics
   */
  async getQueueMetrics(
    jobType?: JobType
  ): Promise<Map<JobType, QueueMetrics> | QueueMetrics | null> {
    if (jobType) {
      return this.metrics.get(jobType) || null;
    }
    return new Map(this.metrics);
  }

  /**
   * Get queue status
   */
  async getQueueStatus(jobType: JobType): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: boolean;
  } | null> {
    const queue = this.queues.get(jobType);
    if (!queue) {
      return null;
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      paused: await queue.isPaused(),
    };
  }

  /**
   * Get jobs by status
   */
  async getJobs(
    jobType: JobType,
    status: JobStatus,
    start = 0,
    end = 50
  ): Promise<Job[]> {
    const queue = this.queues.get(jobType);
    if (!queue) {
      return [];
    }

    switch (status) {
      case JobStatus.WAITING:
        return await queue.getWaiting(start, end);
      case JobStatus.ACTIVE:
        return await queue.getActive(start, end);
      case JobStatus.COMPLETED:
        return await queue.getCompleted(start, end);
      case JobStatus.FAILED:
        return await queue.getFailed(start, end);
      case JobStatus.DELAYED:
        return await queue.getDelayed(start, end);
      default:
        return [];
    }
  }

  /**
   * Clean old jobs
   */
  async cleanOldJobs(
    jobType: JobType,
    grace: number = 24 * 60 * 60 * 1000, // 24 hours
    status: 'completed' | 'failed' = 'completed'
  ): Promise<number> {
    const queue = this.queues.get(jobType);
    if (!queue) {
      return 0;
    }

    const cleaned = await queue.clean(grace, 100, status);
    structuredLogger.info('Old jobs cleaned', {
      jobType,
      cleaned,
      status,
      grace,
    });
    return cleaned.length;
  }

  /**
   * Get system-wide queue statistics
   */
  async getSystemStats(): Promise<{
    totalQueues: number;
    totalJobs: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    };
    averageProcessingTime: number;
    systemLoad: number;
    redisHealth: boolean;
  }> {
    const totalJobs = {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    };

    let totalProcessingTime = 0;
    let processedJobs = 0;

    for (const [jobType, metrics] of this.metrics.entries()) {
      totalJobs.waiting += metrics.waiting;
      totalJobs.active += metrics.active;
      totalJobs.completed += metrics.completed;
      totalJobs.failed += metrics.failed;
      totalJobs.delayed += metrics.delayed;

      if (metrics.totalProcessed > 0) {
        totalProcessingTime +=
          metrics.averageProcessingTime * metrics.totalProcessed;
        processedJobs += metrics.totalProcessed;
      }
    }

    const averageProcessingTime =
      processedJobs > 0 ? totalProcessingTime / processedJobs : 0;
    const systemLoad =
      totalJobs.active / (totalJobs.active + totalJobs.waiting + 1);

    // Test Redis health
    let redisHealth = false;
    try {
      await this.redis.ping();
      redisHealth = true;
    } catch (error) {
      structuredLogger.error('Redis health check failed', error as Error);
    }

    return {
      totalQueues: this.queues.size,
      totalJobs,
      averageProcessingTime,
      systemLoad,
      redisHealth,
    };
  }

  // Private methods

  private async createQueueAndWorker(jobType: JobType): Promise<void> {
    // Create queue
    const queue = new Queue(jobType, {
      connection: this.config.redis,
      defaultJobOptions: this.config.defaultJobOptions,
    });

    // Create worker
    const handler = this.jobHandlers.get(jobType);
    if (!handler) {
      throw new Error(`No handler registered for job type: ${jobType}`);
    }

    const worker = new Worker(
      jobType,
      async (job: Job) => {
        const startTime = Date.now();
        try {
          const result = await handler(job);
          const duration = Date.now() - startTime;

          structuredLogger.info('Job completed', {
            jobId: job.id,
            jobType,
            duration,
            success: result.success,
          });

          this.emit('jobCompleted', { jobType, job, result, duration });
          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          structuredLogger.error('Job failed', error as Error, {
            jobId: job.id,
            jobType,
            duration,
          });

          this.emit('jobFailed', { jobType, job, error, duration });
          throw error;
        }
      },
      {
        connection: this.config.redis,
        concurrency: this.config.concurrency[jobType] || 1,
      }
    );

    // Create queue events
    const queueEvents = new QueueEvents(jobType, {
      connection: this.config.redis,
    });

    // Setup event listeners
    this.setupQueueEventListeners(queueEvents, jobType);

    // Store references
    this.queues.set(jobType, queue);
    this.workers.set(jobType, worker);
    this.queueEvents.set(jobType, queueEvents);

    structuredLogger.info('Queue and worker created', { jobType });
  }

  private setupQueueEventListeners(
    queueEvents: QueueEvents,
    jobType: JobType
  ): void {
    queueEvents.on('completed', (jobId, returnValue) => {
      this.emit('jobStatusChanged', {
        jobType,
        jobId,
        status: JobStatus.COMPLETED,
        returnValue,
      });
    });

    queueEvents.on('failed', (jobId, error) => {
      this.emit('jobStatusChanged', {
        jobType,
        jobId,
        status: JobStatus.FAILED,
        error,
      });
    });

    queueEvents.on('waiting', jobId => {
      this.emit('jobStatusChanged', {
        jobType,
        jobId,
        status: JobStatus.WAITING,
      });
    });

    queueEvents.on('active', jobId => {
      this.emit('jobStatusChanged', {
        jobType,
        jobId,
        status: JobStatus.ACTIVE,
      });
    });

    queueEvents.on('stalled', jobId => {
      structuredLogger.warn('Job stalled', { jobType, jobId });
      this.emit('jobStalled', { jobType, jobId });
    });
  }

  private setupJobHandlers(): void {
    // Process execution handler
    this.jobHandlers.set(
      JobType.PROCESS_EXECUTION,
      async (job: Job<ProcessExecutionJobData>) => {
        // This will be implemented when we integrate with the process manager
        return {
          success: true,
          data: { message: 'Process execution placeholder' },
          duration: 1000,
          metadata: { jobType: JobType.PROCESS_EXECUTION },
        };
      }
    );

    // Adapter operation handler
    this.jobHandlers.set(
      JobType.ADAPTER_OPERATION,
      async (job: Job<AdapterOperationJobData>) => {
        // This will be implemented when we integrate with the adapter system
        return {
          success: true,
          data: { message: 'Adapter operation placeholder' },
          duration: 2000,
          metadata: { jobType: JobType.ADAPTER_OPERATION },
        };
      }
    );

    // Git operation handler
    this.jobHandlers.set(
      JobType.GIT_OPERATION,
      async (job: Job<GitOperationJobData>) => {
        // This will be implemented when we integrate with git operations
        return {
          success: true,
          data: { message: 'Git operation placeholder' },
          duration: 3000,
          metadata: { jobType: JobType.GIT_OPERATION },
        };
      }
    );

    // Default handlers for other job types
    const defaultJobTypes = [
      JobType.FILE_OPERATION,
      JobType.SECURITY_SCAN,
      JobType.CLEANUP_TASK,
      JobType.NOTIFICATION_DELIVERY,
      JobType.SYSTEM_MAINTENANCE,
    ];

    for (const jobType of defaultJobTypes) {
      this.jobHandlers.set(jobType, async (job: Job) => {
        return {
          success: true,
          data: { message: `${jobType} placeholder` },
          duration: 1000,
          metadata: { jobType },
        };
      });
    }
  }

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(async () => {
      for (const [jobType, queue] of this.queues.entries()) {
        try {
          const status = await this.getQueueStatus(jobType);
          if (status) {
            // Calculate processing rate and average time (simplified)
            const currentMetrics = this.metrics.get(jobType);
            const processingRate = currentMetrics
              ? currentMetrics.processingRate
              : 0;
            const averageProcessingTime = currentMetrics
              ? currentMetrics.averageProcessingTime
              : 0;
            const totalProcessed =
              (currentMetrics?.totalProcessed || 0) + status.completed;
            const errorRate =
              totalProcessed > 0 ? status.failed / totalProcessed : 0;

            this.metrics.set(jobType, {
              waiting: status.waiting,
              active: status.active,
              completed: status.completed,
              failed: status.failed,
              delayed: status.delayed,
              paused: status.paused ? 1 : 0,
              totalProcessed,
              processingRate,
              averageProcessingTime,
              errorRate,
            });
          }
        } catch (error) {
          structuredLogger.error('Failed to collect metrics', error as Error, {
            jobType,
          });
        }
      }
    }, 30000); // Every 30 seconds
  }

  private setupGracefulShutdown(): void {
    const shutdown = async () => {
      structuredLogger.info('Shutting down queue system...');

      if (this.metricsInterval) {
        clearInterval(this.metricsInterval);
      }

      // Close all workers
      await Promise.all(
        Array.from(this.workers.values()).map(worker => worker.close())
      );

      // Close all queue events
      await Promise.all(
        Array.from(this.queueEvents.values()).map(events => events.close())
      );

      // Close all queues
      await Promise.all(
        Array.from(this.queues.values()).map(queue => queue.close())
      );

      // Close Redis connection
      await this.redis.quit();

      structuredLogger.info('Queue system shutdown complete');
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }
}

// Export singleton instance
export const processQueueManager = new ProcessQueueManager();
