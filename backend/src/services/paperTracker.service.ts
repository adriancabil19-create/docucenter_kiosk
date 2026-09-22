import {
  getPaperTrays,
  updatePaperTray,
  decrementPaperTray,
  incrementPaperTray,
  setPaperTrayCount,
  updatePaperTrayPaperSize,
  getLowPaperAlerts,
  PaperTrayRow,
} from '../database';
import { logger } from '../utils/logger';

export class PaperTrackerService {
  static async getTrays(kioskId: string): Promise<PaperTrayRow[]> {
    try {
      return await getPaperTrays(kioskId);
    } catch (error) {
      logger.error('Failed to get paper trays', { kioskId, error: String(error) });
      return [];
    }
  }

  static async setTrayCapacity(kioskId: string, trayName: string, maxCapacity: number): Promise<boolean> {
    try {
      await updatePaperTray(kioskId, trayName, maxCapacity, maxCapacity);
      logger.info('Paper tray capacity updated', { kioskId, trayName, maxCapacity });
      return true;
    } catch (error) {
      logger.error('Failed to set tray capacity', { kioskId, trayName, maxCapacity, error: String(error) });
      return false;
    }
  }

  static async setCurrentCount(kioskId: string, trayName: string, count: number): Promise<boolean> {
    try {
      await setPaperTrayCount(kioskId, trayName, count);
      logger.info('Paper tray count set', { kioskId, trayName, count });
      return true;
    } catch (error) {
      logger.error('Failed to set tray count', { kioskId, trayName, count, error: String(error) });
      return false;
    }
  }

  static async refillTray(kioskId: string, trayName: string, sheetsAdded: number): Promise<boolean> {
    try {
      await incrementPaperTray(kioskId, trayName, sheetsAdded);
      logger.info('Paper tray refilled', { kioskId, trayName, sheetsAdded });
      return true;
    } catch (error) {
      logger.error('Failed to refill tray', { kioskId, trayName, sheetsAdded, error: String(error) });
      return false;
    }
  }

  static async usePaper(kioskId: string, trayName: string, sheets: number): Promise<boolean> {
    try {
      await decrementPaperTray(kioskId, trayName, sheets);
      logger.debug('Paper used from tray', { kioskId, trayName, sheets });
      return true;
    } catch (error) {
      logger.error('Failed to decrement paper count', { kioskId, trayName, sheets, error: String(error) });
      return false;
    }
  }

  static async getLowPaperAlerts(
    kioskId: string,
  ): Promise<Array<{ tray_name: string; current_count: number; threshold: number }>> {
    try {
      return await getLowPaperAlerts(kioskId);
    } catch (error) {
      logger.error('Failed to get low paper alerts', { kioskId, error: String(error) });
      return [];
    }
  }

  static async setPaperSize(kioskId: string, trayName: string, paperSize: string): Promise<boolean> {
    try {
      await updatePaperTrayPaperSize(kioskId, trayName, paperSize);
      logger.info('Paper tray paper size updated', { kioskId, trayName, paperSize });
      return true;
    } catch (error) {
      logger.error('Failed to set tray paper size', { kioskId, trayName, paperSize, error: String(error) });
      return false;
    }
  }

  static async hasEnoughPaper(kioskId: string, trayName: string, requiredSheets: number): Promise<boolean> {
    try {
      const trays = await getPaperTrays(kioskId);
      const tray = trays.find((t) => t.tray_name === trayName);
      return tray ? tray.current_count >= requiredSheets : false;
    } catch (error) {
      logger.error('Failed to check paper availability', { kioskId, trayName, requiredSheets, error: String(error) });
      return false;
    }
  }
}
