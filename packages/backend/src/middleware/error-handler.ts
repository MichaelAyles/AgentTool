import { Request, Response, NextFunction } from 'express';
import { structuredLogger } from './logging.js';

export interface ErrorWithStatus extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: any;
  public isOperational: boolean;

  constructor(
    message: string,
    statusCode = 500,
    code = 'INTERNAL_ERROR',
    details?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 401, 'AUTHENTICATION_ERROR', details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

export const errorHandler = (
  error: ErrorWithStatus,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Don't handle if response already sent
  if (res.headersSent) {
    return next(error);
  }

  const statusCode = error.statusCode || 500;
  const code = error.code || 'INTERNAL_ERROR';
  const message = error.message || 'Internal server error';

  // Log error details
  if (statusCode >= 500) {
    structuredLogger.error('Server error', error, {
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      statusCode,
      code,
    });
  } else {
    structuredLogger.warn('Client error', {
      message,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      statusCode,
      code,
    });
  }

  // Prepare error response
  const errorResponse: any = {
    success: false,
    error: {
      code,
      message,
      timestamp: new Date().toISOString(),
    },
  };

  // Add details in development or for client errors
  if (process.env.NODE_ENV === 'development' || statusCode < 500) {
    if (error.details) {
      errorResponse.error.details = error.details;
    }
  }

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = error.stack;
  }

  res.status(statusCode).json(errorResponse);
};

export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const error = new NotFoundError(`Route ${req.method} ${req.originalUrl}`);
  next(error);
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
