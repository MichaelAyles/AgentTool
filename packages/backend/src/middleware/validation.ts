import { Request, Response, NextFunction } from 'express';
import { ValidationError } from './error-handler.js';

export const validateBody = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false });

    if (error) {
      const details = error.details.map((detail: any) => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
      }));

      throw new ValidationError('Invalid request body', details);
    }

    req.body = value;
    next();
  };
};

export const validateParams = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.params, { abortEarly: false });

    if (error) {
      const details = error.details.map((detail: any) => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
      }));

      throw new ValidationError('Invalid request parameters', details);
    }

    req.params = value;
    next();
  };
};

export const validateQuery = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.query, { abortEarly: false });

    if (error) {
      const details = error.details.map((detail: any) => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
      }));

      throw new ValidationError('Invalid query parameters', details);
    }

    req.query = value;
    next();
  };
};

// Basic validation functions without external dependencies
export const validateRequired = (fields: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const missing = fields.filter(field => {
      const value = req.body[field];
      return value === undefined || value === null || value === '';
    });

    if (missing.length > 0) {
      throw new ValidationError(
        `Missing required fields: ${missing.join(', ')}`
      );
    }

    next();
  };
};

export const validateTypes = (
  fieldTypes: Record<
    string,
    'string' | 'number' | 'boolean' | 'array' | 'object'
  >
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: Array<{ field: string; expected: string; received: string }> =
      [];

    Object.entries(fieldTypes).forEach(([field, expectedType]) => {
      const value = req.body[field];

      if (value !== undefined) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;

        if (actualType !== expectedType) {
          errors.push({
            field,
            expected: expectedType,
            received: actualType,
          });
        }
      }
    });

    if (errors.length > 0) {
      throw new ValidationError('Type validation failed', errors);
    }

    next();
  };
};
