import { Request, Response, NextFunction } from 'express';
import { createPrometheusMetrics } from 'prom-client';

// Create Prometheus registry and metrics
const promClient = require('prom-client');
const register = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({ register });

// HTTP metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
  registers: [register],
});

const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// Application-specific metrics
const validationQueueLength = new promClient.Gauge({
  name: 'validation_queue_length',
  help: 'Number of tasks in validation queue',
  registers: [register],
});

const validationTotal = new promClient.Counter({
  name: 'validation_total',
  help: 'Total number of validations',
  labelNames: ['status'],
  registers: [register],
});

const validationDuration = new promClient.Histogram({
  name: 'validation_duration_seconds',
  help: 'Duration of validation processes in seconds',
  labelNames: ['criteria_type'],
  buckets: [1, 5, 10, 30, 60, 300, 600],
  registers: [register],
});

const adapterErrors = new promClient.Counter({
  name: 'adapter_errors_total',
  help: 'Total number of adapter errors',
  labelNames: ['adapter', 'error_type'],
  registers: [register],
});

const websocketConnections = new promClient.Gauge({
  name: 'websocket_connections_active',
  help: 'Number of active WebSocket connections',
  registers: [register],
});

const processMemoryUsage = new promClient.Gauge({
  name: 'process_memory_usage_bytes',
  help: 'Process memory usage in bytes',
  labelNames: ['type'],
  registers: [register],
});

// Update memory metrics periodically
setInterval(() => {
  const memUsage = process.memoryUsage();
  processMemoryUsage.set({ type: 'rss' }, memUsage.rss);
  processMemoryUsage.set({ type: 'heapUsed' }, memUsage.heapUsed);
  processMemoryUsage.set({ type: 'heapTotal' }, memUsage.heapTotal);
  processMemoryUsage.set({ type: 'external' }, memUsage.external);
}, 5000);

/**
 * Middleware to collect HTTP metrics
 */
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  
  // Get route pattern (not the actual path with parameters)
  const route = req.route?.path || req.path;
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const labels = {
      method: req.method,
      route: route,
      status_code: res.statusCode.toString(),
    };
    
    httpRequestDuration.observe(labels, duration);
    httpRequestsTotal.inc(labels);
  });
  
  next();
};

/**
 * Metrics endpoint handler
 */
export const metricsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.send(metrics);
  } catch (error) {
    res.status(500).send('Error generating metrics');
  }
};

/**
 * Application metrics functions
 */
export const metrics = {
  // Validation metrics
  recordValidation: (status: 'success' | 'failure') => {
    validationTotal.inc({ status });
  },
  
  recordValidationDuration: (criteriaType: string, duration: number) => {
    validationDuration.observe({ criteria_type: criteriaType }, duration);
  },
  
  setValidationQueueLength: (length: number) => {
    validationQueueLength.set(length);
  },
  
  // Adapter metrics
  recordAdapterError: (adapter: string, errorType: string) => {
    adapterErrors.inc({ adapter, error_type: errorType });
  },
  
  // WebSocket metrics
  setWebSocketConnections: (count: number) => {
    websocketConnections.set(count);
  },
  
  incrementWebSocketConnections: () => {
    websocketConnections.inc();
  },
  
  decrementWebSocketConnections: () => {
    websocketConnections.dec();
  },
  
  // Custom metrics
  createCounter: (name: string, help: string, labelNames: string[] = []) => {
    return new promClient.Counter({
      name,
      help,
      labelNames,
      registers: [register],
    });
  },
  
  createGauge: (name: string, help: string, labelNames: string[] = []) => {
    return new promClient.Gauge({
      name,
      help,
      labelNames,
      registers: [register],
    });
  },
  
  createHistogram: (name: string, help: string, labelNames: string[] = [], buckets?: number[]) => {
    return new promClient.Histogram({
      name,
      help,
      labelNames,
      buckets,
      registers: [register],
    });
  },
};

export { register as metricsRegistry };