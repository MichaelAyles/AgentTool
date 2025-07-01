import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export interface RequestWithId extends Request {
  id: string;
  startTime: number;
}

export const requestLogger = (req: RequestWithId, res: Response, next: NextFunction) => {
  req.id = uuidv4();
  req.startTime = Date.now();

  const originalSend = res.send;
  res.send = function(body) {
    const duration = Date.now() - req.startTime;
    const contentLength = Buffer.byteLength(body || '', 'utf8');
    
    console.log(`[${new Date().toISOString()}] ${req.id} ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms ${contentLength}b`);
    
    return originalSend.call(this, body);
  };

  next();
};

export const errorLogger = (error: Error, req: RequestWithId, res: Response, next: NextFunction) => {
  const duration = Date.now() - req.startTime;
  
  console.error(`[${new Date().toISOString()}] ERROR ${req.id} ${req.method} ${req.originalUrl} ${duration}ms`, {
    error: error.message,
    stack: error.stack,
    body: req.body,
    query: req.query,
    params: req.params,
  });

  next(error);
};

export const structuredLogger = {
  info: (message: string, meta?: Record<string, any>) => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      message,
      ...meta,
    }));
  },
  
  warn: (message: string, meta?: Record<string, any>) => {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      message,
      ...meta,
    }));
  },
  
  error: (message: string, error?: Error | string, meta?: Record<string, any>) => {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      message,
      error: typeof error === 'string' ? error : error?.message,
      stack: typeof error === 'object' ? error?.stack : undefined,
      ...meta,
    }));
  },
  
  debug: (message: string, meta?: Record<string, any>) => {
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG) {
      console.debug(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'debug',
        message,
        ...meta,
      }));
    }
  },
};