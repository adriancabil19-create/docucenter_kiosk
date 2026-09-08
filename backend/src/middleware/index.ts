import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

/**
 * Rate limiting middleware.
 *
 * The limiter exists to protect the public / payment surface. It is skipped for:
 *  - the health check,
 *  - loopback traffic (kiosk app ⇄ local backend, fleet agent ⇄ localhost),
 *  - machine-to-machine and admin monitoring endpoints, which carry their own
 *    auth (X-Sync-Secret, kiosk token, admin bearer) and are polled on a timer.
 * Without these exemptions the ~10–20 s poll loops trip the global 100-req
 * window within a minute or two.
 */
const RATE_LIMIT_EXEMPT_PREFIXES = ['/api/sync/', '/api/kiosk/', '/api/fleet/', '/api/monitoring/'];

const isLoopback = (ip: string | undefined): boolean =>
  ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';

export const rateLimitMiddleware = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: any) =>
    req.path === '/health' ||
    isLoopback(req.ip) ||
    RATE_LIMIT_EXEMPT_PREFIXES.some((p) => req.path.startsWith(p)),
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
  const origin = req.headers.origin;
  if (origin && config.allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.header('Access-Control-Allow-Origin', '*');
  }
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
export const securityHeadersMiddleware = (
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
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
    logger[level as 'warn' | 'info'](`${req.method} ${req.path}`, {
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
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
  _next: NextFunction,
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
