import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

/**
 * Normalize an origin string so comparisons are resilient to how the value was
 * entered in the deployment env: strips surrounding quotes/whitespace, a
 * trailing slash, and lowercases the scheme+host. Returns '' for empty input.
 */
export const normalizeOrigin = (value: string | undefined | null): string => {
  if (!value) return '';
  const cleaned = value
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .trim()
    .replace(/\/+$/, '');
  return cleaned ? cleaned.toLowerCase() : '';
};

/** Read a boolean-ish env flag, tolerating surrounding quotes/whitespace/case. */
const envFlag = (value: string | undefined): boolean =>
  (value || '').trim().replace(/^['"]+|['"]+$/g, '').trim().toLowerCase() === 'true';

/** Read a string env var, tolerating surrounding quotes/whitespace. Returns fallback for empty. */
const envStr = (value: string | undefined, fallback = ''): string => {
  const cleaned = (value || '').trim().replace(/^['"]+|['"]+$/g, '').trim();
  return cleaned || fallback;
};

/**
 * Which role(s) this backend instance plays.
 *  - 'kiosk' : runs on the physical kiosk. Sends heartbeats, polls for admin
 *              commands, owns the document files, runs the retention purge.
 *  - 'cloud' : the Railway instance. Receives sync + heartbeats, serves the
 *              admin console, reaps offline kiosks.
 *  - 'both'  : single-process dev / demo setup (default).
 */
export type InstanceRole = 'kiosk' | 'cloud' | 'both';
const rawRole = envStr(process.env.INSTANCE_ROLE, 'both').toLowerCase();
const instanceRole: InstanceRole =
  rawRole === 'kiosk' || rawRole === 'cloud' ? (rawRole as InstanceRole) : 'both';

export const config = {
  // Server
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:5000',
  uploadsPath: process.env.UPLOADS_PATH || path.resolve(__dirname, '../../..', 'Uploads'),
  dynamsoftLicense: process.env.DYNAMSOFT_LICENSE || '',
  adminApiToken: process.env.ADMIN_API_TOKEN || '',
  kioskApiToken: process.env.KIOSK_API_TOKEN || '',

  // Fleet identity & role
  instanceRole,
  isKioskRole: instanceRole === 'kiosk' || instanceRole === 'both',
  isCloudRole: instanceRole === 'cloud' || instanceRole === 'both',
  kioskId: envStr(process.env.KIOSK_ID, 'DOCUCENTER-01'),
  kioskLabel: envStr(process.env.KIOSK_LABEL, 'DocuCenter Kiosk 01'),
  /** How often the kiosk emits a heartbeat (ms). Liveness only — not latency-critical. */
  heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '20000', 10),
  /**
   * How often the kiosk polls for pending admin commands (ms). This is the
   * admin→kiosk control latency; keep it short. Floored at 1000 ms.
   */
  commandPollIntervalMs: Math.max(
    1000,
    parseInt(process.env.COMMAND_POLL_INTERVAL_MS || '2000', 10) || 2000,
  ),
  /** A kiosk with no heartbeat newer than this is considered OFFLINE (seconds). */
  kioskOfflineAfterSeconds: parseInt(process.env.KIOSK_OFFLINE_AFTER_SECONDS || '60', 10),
  publicBaseUrl:
    process.env.PUBLIC_BASE_URL ||
    (process.env.NODE_ENV === 'production'
      ? 'https://grand-tenderness-production-b632.up.railway.app'
      : ''),

  // CORS — comma-separated list of allowed origins, e.g.:
  //   ALLOWED_ORIGINS=http://localhost:3000,https://your-admin.up.railway.app
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  allowedOrigins: Array.from(
    new Set(
      (
        process.env.ALLOWED_ORIGINS ||
        process.env.FRONTEND_URL ||
        'http://localhost:3000'
      )
        .split(',')
        .map(normalizeOrigin)
        .concat([process.env.PUBLIC_BASE_URL, process.env.API_BASE_URL].map(normalizeOrigin))
        .filter(Boolean),
    ),
  ),
  corsEnabled: envFlag(process.env.ENABLE_CORS),
  corsCredentials: envFlag(process.env.CORS_CREDENTIALS),

  // Security
  helmetEnabled: envFlag(process.env.ENABLE_HELMET),
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

  // Cloud sync — set on the LOCAL kiosk backend only.
  // SYNC_URL and SYNC_SECRET must match the cloud backend configuration.
  sync: {
    url: (process.env.SYNC_URL || '').replace(/\/$/, ''),
    secret: process.env.SYNC_SECRET || '',
  },

  // Customer "Ask for Assistance" — request pacing and staff response SLAs.
  assistance: {
    /** Minimum seconds between two requests from the same kiosk. */
    requestCooldownSeconds: parseInt(process.env.ASSISTANCE_REQUEST_COOLDOWN || '60', 10),
    /** Max requests a single kiosk may create within the rate-limit window. */
    maxRequestsPerWindow: parseInt(process.env.ASSISTANCE_MAX_REQUESTS || '5', 10),
    /** Rolling window (seconds) the max-requests cap applies over. */
    rateLimitWindowSeconds: parseInt(process.env.ASSISTANCE_RATE_LIMIT_WINDOW || '600', 10),
    /** Unacknowledged PENDING request age (seconds) that triggers an admin escalation incident. */
    escalationSeconds: parseInt(process.env.ASSISTANCE_ESCALATION_TIME || '300', 10),
    /** Unacknowledged PENDING request age (seconds) after which it auto-expires. */
    expirationSeconds: parseInt(process.env.ASSISTANCE_EXPIRATION_TIME || '600', 10),
    /** How long a read notification is kept before housekeeping prunes it. */
    notificationRetentionDays: parseInt(process.env.NOTIFICATION_RETENTION_DAYS || '30', 10),
  },

  // Web Push (phone/browser OS-level notifications for the admin console).
  // Generate a pair with `npx web-push generate-vapid-keys`. The public key
  // must also be set as NEXT_PUBLIC_VAPID_PUBLIC_KEY on the admin console
  // (same value) so the browser can create a subscription. Push is only ever
  // sent from the cloud-role instance (see push.service.ts) — that's where
  // subscriptions live, since only the console talks to it.
  push: {
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
    vapidSubject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  },

  // Staff Print Recovery — how far back a failed-but-paid transaction stays
  // eligible for reprint before staff must ask an Admin to reauthorize it.
  printRecoveryWindowMinutes: parseInt(process.env.PRINT_RECOVERY_WINDOW_MINUTES || '60', 10),

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
