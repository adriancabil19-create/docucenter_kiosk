import { Pool } from 'pg';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

let pool: Pool | null = null;

if (config.aiven.databaseUrl) {
  pool = new Pool({
    connectionString: config.aiven.databaseUrl,
    ssl: config.aiven.requireSsl
      ? {
          rejectUnauthorized: false,
        }
      : false,
  });

  pool.on('error', (err) => {
    logger.error('Aiven pool error', { error: err.message });
  });
}

export const aivenService = {
  // verifyQr looks up a QR code in an Aiven/Postgres table named `qr_verifications`.
  // It expects a row with columns: qr_code (text) and verified (boolean).
  // If no Aiven connection is configured, it returns a development-friendly mock.
  async verifyQr(qr: string): Promise<{ ok: boolean; verified?: boolean; reason?: string }> {
    if (!pool) {
      logger.info('Aiven not configured, using mock verification', { qr });
      // Development fallback: accept non-empty qr strings
      if (!qr) return { ok: false, reason: 'empty_qr' };
      return { ok: true, verified: true };
    }

    try {
      const res = await pool.query(
        'SELECT verified FROM qr_verifications WHERE qr_code = $1 LIMIT 1',
        [qr],
      );
      if (res.rowCount === 0) {
        return { ok: false, verified: false, reason: 'not_found' };
      }
      const verified = !!res.rows[0].verified;
      return { ok: true, verified };
    } catch (err: any) {
      logger.error('Aiven verifyQr error', { error: err.message });
      return { ok: false, reason: 'db_error' };
    }
  },
};

export default aivenService;
