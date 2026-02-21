import express, { Express } from 'express';
import bodyParser from 'body-parser';
import helmet from 'helmet';
import cors from 'cors';

import { config, validateConfig } from './utils/config';
import { logger } from './utils/logger';
import gcashRoutes from './routes/gcash';
import qrRoutes from './routes/qr';
import printRoutes from './routes/print';
import storageRoutes from './routes/storage';
import {
  corsMiddleware,
  securityHeadersMiddleware,
  requestLoggingMiddleware,
  errorHandlingMiddleware,
  notFoundMiddleware,
  rateLimitMiddleware,
} from './middleware';

// Initialize Express app
const app: Express = express();

// Validate configuration
validateConfig();

// ============================================================================
// Middleware Setup
// ============================================================================

// Security middleware
if (config.helmetEnabled) {
  app.use(helmet());
}

// CORS configuration
if (config.corsEnabled) {
  app.use(
    cors({
      origin: config.frontendUrl,
      credentials: config.corsCredentials,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Webhook-Signature'],
      maxAge: 86400,
    })
  );
} else {
  app.use(corsMiddleware);
}

// Body parsing middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// Security headers
app.use(securityHeadersMiddleware);

// Request logging
app.use(requestLoggingMiddleware);

// Rate limiting
app.use(rateLimitMiddleware);

// ============================================================================
// Routes
// ============================================================================

// Health check (before versioned API)
app.get('/health', (_req: any, res: any) => {
  res.json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use('/api/gcash', gcashRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/print', printRoutes);
app.use('/api/storage', storageRoutes);

// API status endpoint
app.get('/api/status', (_req: any, res: any) => {
  res.json({
    success: true,
    message: 'API is running',
    version: '1.0.0',
    environment: config.env,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// Error Handling
// ============================================================================

// 404 handler
app.use(notFoundMiddleware);

// Global error handler (must be last)
app.use(errorHandlingMiddleware);

// ============================================================================
// Server Start
// ============================================================================

const PORT = config.port;

const server = app.listen(PORT, () => {
  logger.info(`Server started`, {
    port: PORT,
    environment: config.env,
    corsEnabled: config.corsEnabled,
    helmetEnabled: config.helmetEnabled,
  });

  logger.info(`GCash Payment Integration API`, {
    baseUrl: `http://localhost:${PORT}`,
    healthCheck: `http://localhost:${PORT}/health`,
    apiStatus: `http://localhost:${PORT}/api/status`,
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', {
    reason: String(reason),
    promise: String(promise),
  });
});

export default app;
