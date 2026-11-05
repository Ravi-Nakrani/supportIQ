import type { Request, Response, NextFunction, ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, type ApiErrorEnvelope } from '../types/error.types.js';

/**
 * 404 Not Found handler for unmatched routes.
 */
export const notFoundHandler: RequestHandler = (req: Request, res: Response): void => {
  const fullPath = req.originalUrl ? req.originalUrl.split('?')[0] : req.path;
  const envelope: ApiErrorEnvelope = {
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${fullPath}`,
      details: null,
    },
  };

  res.status(404).json(envelope);
};

/**
 * Centralized Express error-handling middleware.
 * Formats errors into the standard ApiErrorEnvelope.
 * Protects against internal diagnostic and stack trace leakage in public responses.
 */
export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Handle known operational application errors
  if (err instanceof AppError) {
    const envelope: ApiErrorEnvelope = {
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    };

    res.status(err.statusCode).json(envelope);
    return;
  }

  // Handle malformed JSON body from express.json()
  if (
    err instanceof SyntaxError &&
    'status' in err &&
    typeof (err as { status: unknown }).status === 'number' &&
    (err as { status: number }).status === 400 &&
    'body' in err
  ) {
    const envelope: ApiErrorEnvelope = {
      error: {
        code: 'BAD_REQUEST',
        message: 'Malformed JSON request body.',
        details: null,
      },
    };

    res.status(400).json(envelope);
    return;
  }

  // Log unexpected errors server-side with stack trace
  console.error('[SERVER ERROR] Unhandled exception:', err);

  // Return generic safe error response to client
  const fallbackEnvelope: ApiErrorEnvelope = {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected server error occurred.',
      details: null,
    },
  };

  res.status(500).json(fallbackEnvelope);
};

