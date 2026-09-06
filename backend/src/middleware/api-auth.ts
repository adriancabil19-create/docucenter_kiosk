import { Request, Response, NextFunction } from 'express';
import { config } from '../utils/config';

const bearerToken = (req: Request): string => {
  const header = req.header('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
};

const unauthorized = (res: Response): void => {
  res.status(401).json({ success: false, error: 'Unauthorized' });
};

export const requireAdminApiToken = (req: Request, res: Response, next: NextFunction): void => {
  if (!config.adminApiToken && config.isDevelopment) {
    next();
    return;
  }
  if (!config.adminApiToken || bearerToken(req) !== config.adminApiToken) {
    unauthorized(res);
    return;
  }
  next();
};

export const requireKioskApiToken = (req: Request, res: Response, next: NextFunction): void => {
  const loopback = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
  if (loopback || (!config.kioskApiToken && config.isDevelopment)) {
    next();
    return;
  }
  const supplied = req.header('x-kiosk-token') || bearerToken(req);
  if (!config.kioskApiToken || supplied !== config.kioskApiToken) {
    unauthorized(res);
    return;
  }
  next();
};