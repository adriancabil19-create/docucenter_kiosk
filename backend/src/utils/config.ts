import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:5000',

  // CORS
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  corsEnabled: process.env.ENABLE_CORS === 'true',
  corsCredentials: process.env.CORS_CREDENTIALS === 'true',

  // Security
  helmetEnabled: process.env.ENABLE_HELMET === 'true',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),

  // GCash Configuration
  gcash: {
    merchantId: process.env.GCASH_MERCHANT_ID || '',
    apiKey: process.env.GCASH_API_KEY || '',
    secretKey: process.env.GCASH_SECRET_KEY || '',
    apiBaseUrl: process.env.GCASH_API_BASE_URL || 'https://api.gcash.com',
    webhookSecret: process.env.GCASH_WEBHOOK_SECRET || '',
  },

  // Payment Configuration
  payment: {
    timeoutSeconds: parseInt(process.env.PAYMENT_TIMEOUT_SECONDS || '300', 10),
    pollingIntervalMs: parseInt(process.env.PAYMENT_POLLING_INTERVAL_MS || '3000', 10),
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // Validation
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV === 'development',
  
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
  const requiredVars = [
    'GCASH_MERCHANT_ID',
    'GCASH_API_KEY',
    'GCASH_SECRET_KEY',
    'GCASH_WEBHOOK_SECRET',
  ];

  if (config.isProduction) {
    const missing = requiredVars.filter((v) => !process.env[v]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }
};
