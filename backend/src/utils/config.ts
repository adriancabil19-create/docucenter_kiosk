import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

export const config = {
  // Server
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:5000',

  // CORS — comma-separated list of allowed origins, e.g.:
  //   ALLOWED_ORIGINS=http://localhost:3000,https://admin.onrender.com
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  allowedOrigins: (
    process.env.ALLOWED_ORIGINS ||
    process.env.FRONTEND_URL ||
    'http://localhost:3000'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  corsEnabled: process.env.ENABLE_CORS === 'true',
  corsCredentials: process.env.CORS_CREDENTIALS === 'true',

  // Security
  helmetEnabled: process.env.ENABLE_HELMET === 'true',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),

  // PAYMONGO Configuration
  PAYMONGO: {
    merchantId: process.env.PAYMONGO_MERCHANT_ID || '',
    apiKey: process.env.PAYMONGO_API_KEY || '',
    secretKey: process.env.PAYMONGO_SECRET_KEY || '',
    apiBaseUrl: process.env.PAYMONGO_API_BASE_URL || 'https://api.paymongo.com/v1',
    webhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET || '',
  },

  // Payment Configuration
  payment: {
    timeoutSeconds: parseInt(process.env.PAYMENT_TIMEOUT_SECONDS || '300', 10),
    pollingIntervalMs: parseInt(process.env.PAYMENT_POLLING_INTERVAL_MS || '3000', 10),
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // Validation — treat missing NODE_ENV as 'development' (thesis/demo default)
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: (process.env.NODE_ENV || 'development') !== 'production',
  // Print options
  print: {
    // Enable copying printed files to PrintSimulation folder when true.
    // Set env var PRINT_SIMULATION_ENABLED=false to disable.
    simulationEnabled: (process.env.PRINT_SIMULATION_ENABLED || 'true') === 'true',
    // Name of the printer to use. Leave empty to use the system default.
    printerName: process.env.PRINTER_NAME || '',
  },

  // Render sync — set on the LOCAL kiosk backend only.
  // RENDER_SYNC_URL  = https://docucenter-api.onrender.com
  // RENDER_SYNC_SECRET = any random secret string (same value on both sides)
  renderSync: {
    url: (process.env.RENDER_SYNC_URL || '').replace(/\/$/, ''),
    secret: process.env.RENDER_SYNC_SECRET || '',
  },

  // Aiven / External DB (optional)
  aiven: {
    databaseUrl: process.env.AIVEN_DATABASE_URL || process.env.DATABASE_URL || '',
    user: process.env.AIVEN_DB_USER || '',
    password: process.env.AIVEN_DB_PASSWORD || '',
    requireSsl: process.env.AIVEN_REQUIRE_SSL === 'true',
  },
};

// Validate required configuration
export const validateConfig = (): void => {
  const requiredVars = ['PAYMONGO_SECRET_KEY', 'PAYMONGO_WEBHOOK_SECRET'];

  if (config.isProduction) {
    const missing = requiredVars.filter((v) => !process.env[v]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }
};
