import winston from 'winston';
import { ElasticsearchTransport } from 'winston-elasticsearch';

// Log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Log colors
const logColors = {
  error: 'red',
  warn: 'yellow', 
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(logColors);

// Format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

// Format for file/elastic output  
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create transports array
const transports: winston.transport[] = [
  // Console transport for development
  new winston.transports.Console({
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
    format: consoleFormat,
  }),
  
  // File transport for all logs
  new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: fileFormat,
    maxsize: 50 * 1024 * 1024, // 50MB
    maxFiles: 5,
  }),
  
  // File transport for combined logs
  new winston.transports.File({
    filename: 'logs/combined.log',
    format: fileFormat,
    maxsize: 100 * 1024 * 1024, // 100MB
    maxFiles: 10,
  }),
];

// Add Elasticsearch transport for production
if (process.env.NODE_ENV === 'production' && process.env.ELASTICSEARCH_ENABLED === 'true') {
  const esTransport = new ElasticsearchTransport({
    clientOpts: {
      node: process.env.ELASTICSEARCH_URL || 'http://elasticsearch:9200',
    },
    level: 'info',
    index: 'vibe-code-logs',
    indexPrefix: 'vibe-code',
    indexSuffixPattern: 'YYYY.MM.DD',
    transformer: (logData: any) => {
      return {
        '@timestamp': new Date().toISOString(),
        severity: logData.level,
        message: logData.message,
        fields: {
          service: 'vibe-code-backend',
          environment: process.env.NODE_ENV,
          ...logData.meta,
        },
      };
    },
  });
  
  transports.push(esTransport);
}

// Create logger instance
export const structuredLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels: logLevels,
  format: fileFormat,
  transports,
  // Don't exit on handled exceptions
  exitOnError: false,
});

// Handle uncaught exceptions and rejections
structuredLogger.exceptions.handle(
  new winston.transports.File({ filename: 'logs/exceptions.log' })
);

structuredLogger.rejections.handle(
  new winston.transports.File({ filename: 'logs/rejections.log' })
);

// Create a stream for Morgan HTTP logger
export const httpLoggerStream = {
  write: (message: string) => {
    structuredLogger.http(message.trim());
  },
};

// Helper functions for structured logging
export const logActivity = (activity: string, data: any = {}) => {
  structuredLogger.info(activity, {
    activity,
    timestamp: new Date().toISOString(),
    ...data,
  });
};

export const logSecurity = (event: string, data: any = {}) => {
  structuredLogger.warn(event, {
    security_event: event,
    timestamp: new Date().toISOString(),
    ...data,
  });
};

export const logValidation = (validationId: string, event: string, data: any = {}) => {
  structuredLogger.info(`Validation ${event}`, {
    validation_id: validationId,
    validation_event: event,
    timestamp: new Date().toISOString(),
    ...data,
  });
};

export const logAdapter = (adapter: string, event: string, data: any = {}) => {
  structuredLogger.info(`Adapter ${event}`, {
    adapter,
    adapter_event: event,
    timestamp: new Date().toISOString(),
    ...data,
  });
};

export const logPerformance = (operation: string, duration: number, data: any = {}) => {
  structuredLogger.info(`Performance: ${operation}`, {
    operation,
    duration_ms: duration,
    performance_event: true,
    timestamp: new Date().toISOString(),
    ...data,
  });
};

// Middleware for request logging
export const requestLoggerMiddleware = (req: any, res: any, next: any) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration_ms: duration,
      user_id: req.user?.id,
      ip: req.ip || req.connection?.remoteAddress,
      user_agent: req.get('User-Agent'),
    };
    
    if (res.statusCode >= 400) {
      structuredLogger.warn('HTTP Request', logData);
    } else {
      structuredLogger.http('HTTP Request', logData);
    }
  });
  
  next();
};

export default structuredLogger;