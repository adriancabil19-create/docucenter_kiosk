import express, { Express } from 'express';
import bodyParser from 'body-parser';
import helmet from 'helmet';
import cors from 'cors';

import { config, validateConfig } from './utils/config';
import { logger } from './utils/logger';
import paymongoRoutes from './routes/paymongo';
import qrphRoutes from './routes/qrph.routes';
import qrRoutes from './routes/qr';
import printRoutes from './routes/print';
import storageRoutes from './routes/storage';
import monitoringRoutes from './routes/monitoring';
import scanRoutes from './routes/scan';
import paperTrackerRoutes from './routes/paperTracker';
import syncRoutes from './routes/sync';
import transferRoutes from './routes/transfer';
import {
  corsMiddleware,
  securityHeadersMiddleware,
  requestLoggingMiddleware,
  errorHandlingMiddleware,
  notFoundMiddleware,
  rateLimitMiddleware,
} from './middleware';
import { cancelStalePendingTransactions, insertLog, initSchema } from './database';

// Initialize Express app
const app: Express = express();

// Trust proxy for ngrok and rate limiting
app.set('trust proxy', 1);

// Validate configuration
validateConfig();

// ============================================================================
// Middleware Setup
// ============================================================================

// Security middleware
if (config.helmetEnabled) {
  app.use(helmet());
}

// CORS configuration — supports multiple origins via ALLOWED_ORIGINS env var
if (config.corsEnabled) {
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, Render health checks)
        if (!origin) return callback(null, true);
        if (config.allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS blocked: origin ${origin} not in ALLOWED_ORIGINS`));
      },
      credentials: config.corsCredentials,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Webhook-Signature'],
      maxAge: 86400,
    }),
  );
} else {
  app.use(corsMiddleware);
}

// Body parsing middleware
app.use(
  bodyParser.json({
    limit: '100mb',
    verify: (req: any, _res: any, buf: Buffer) => {
      req.rawBody = buf.toString();
    },
  }),
);
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));

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
app.use('/api/paymongo', paymongoRoutes);
app.use('/', qrphRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/print', printRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/monitoring', monitoringRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/paper-tracker', paperTrackerRoutes);
app.use('/api/sync', syncRoutes);
app.use('/', transferRoutes);

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

// Initialize DB schema then start server
initSchema()
  .then(() => {
    logger.info('Database initialized', {
      url: process.env.TURSO_DATABASE_URL ? 'turso (remote)' : 'file (local)',
    });

    const server = app.listen(PORT, () => {
      logger.info(`Server started`, {
        port: PORT,
        environment: config.env,
        corsEnabled: config.corsEnabled,
        helmetEnabled: config.helmetEnabled,
      });
      logger.info(`PAYMONGO Payment Integration API`, {
        baseUrl: `http://localhost:${PORT}`,
        healthCheck: `http://localhost:${PORT}/health`,
        apiStatus: `http://localhost:${PORT}/api/status`,
      });
    });

    // Auto-cancel transactions that have been PENDING/PROCESSING for more than 5 minutes
    setInterval(async () => {
      try {
        const cancelled = await cancelStalePendingTransactions(5);
        for (const id of cancelled) {
          await insertLog('info', 'payment', 'Auto-cancelled stale pending transaction', { transactionId: id });
          logger.info('Auto-cancelled stale transaction', { transactionId: id });
        }
      } catch (err) {
        logger.error('Auto-cancel interval error', { error: String(err) });
      }
    }, 60_000);

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully...');
      server.close(() => { logger.info('Server closed'); process.exit(0); });
    });
    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully...');
      server.close(() => { logger.info('Server closed'); process.exit(0); });
    });
  })
  .catch((err) => {
    logger.error('Database initialization failed — exiting', { error: String(err) });
    process.exit(1);
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
