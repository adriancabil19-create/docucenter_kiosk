import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

/**
 * Rate limiting middleware
 */
export const rateLimitMiddleware = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: any, res: any) => {
    logger.warn('Rate limit exceeded', { ip: req.ip, path: req.path });
    res.status(429).json({
      success: false,
      error: 'Too many requests',
      message: 'Please try again later',
    });
  },
});

/**
 * CORS headers middleware
 */
export const corsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (!config.corsEnabled) {
    return next();
  }

  res.header('Access-Control-Allow-Origin', config.frontendUrl);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Webhook-Signature');
  res.header('Access-Control-Max-Age', '86400');

  if (config.corsCredentials) {
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
};

/**
 * Security headers middleware
 */
export const securityHeadersMiddleware = (_req: Request, res: Response, next: NextFunction): void => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
};

/**
 * Request logging middleware
 */
export const requestLoggingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'warn' : 'info';
    logger[level as 'warn' | 'info'](
      `${req.method} ${req.path}`,
      {
        status: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      }
    );
  });

  next();
};

/**
 * Error handling middleware
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandlingMiddleware = (
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  logger.error('Request error', {
    path: req.path,
    method: req.method,
    error: err.message,
  });

  const statusCode = err.statusCode || 500;
  const message = config.isDevelopment ? err.message : 'Internal server error';

  res.status(statusCode).json({
    success: false,
    error: message,
    message: 'An error occurred processing your request',
    ...(config.isDevelopment && { details: err.stack }),
  });
};

/**
 * Not found middleware
 */
export const notFoundMiddleware = (req: Request, res: Response): void => {
  logger.warn('404 Not Found', { path: req.path, method: req.method });
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Route ${req.path} not found`,
  });
};
