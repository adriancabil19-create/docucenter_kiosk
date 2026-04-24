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
  static async getTrays(): Promise<PaperTrayRow[]> {
    try {
      return await getPaperTrays();
    } catch (error) {
      logger.error('Failed to get paper trays', { error: String(error) });
      return [];
    }
  }

  static async setTrayCapacity(trayName: string, maxCapacity: number): Promise<boolean> {
    try {
      await updatePaperTray(trayName, maxCapacity, maxCapacity);
      logger.info('Paper tray capacity updated', { trayName, maxCapacity });
      return true;
    } catch (error) {
      logger.error('Failed to set tray capacity', { trayName, maxCapacity, error: String(error) });
      return false;
    }
  }

  static async setCurrentCount(trayName: string, count: number): Promise<boolean> {
    try {
      await setPaperTrayCount(trayName, count);
      logger.info('Paper tray count set', { trayName, count });
      return true;
    } catch (error) {
      logger.error('Failed to set tray count', { trayName, count, error: String(error) });
      return false;
    }
  }

  static async refillTray(trayName: string, sheetsAdded: number): Promise<boolean> {
    try {
      await incrementPaperTray(trayName, sheetsAdded);
      logger.info('Paper tray refilled', { trayName, sheetsAdded });
      return true;
    } catch (error) {
      logger.error('Failed to refill tray', { trayName, sheetsAdded, error: String(error) });
      return false;
    }
  }

  static async usePaper(trayName: string, sheets: number): Promise<boolean> {
    try {
      await decrementPaperTray(trayName, sheets);
      logger.info('Paper used from tray', { trayName, sheets });
      return true;
    } catch (error) {
      logger.error('Failed to decrement paper count', { trayName, sheets, error: String(error) });
      return false;
    }
  }

  static async getLowPaperAlerts(): Promise<Array<{ tray_name: string; current_count: number; threshold: number }>> {
    try {
      return await getLowPaperAlerts();
    } catch (error) {
      logger.error('Failed to get low paper alerts', { error: String(error) });
      return [];
    }
  }

  static async setPaperSize(trayName: string, paperSize: string): Promise<boolean> {
    try {
      await updatePaperTrayPaperSize(trayName, paperSize);
      logger.info('Paper tray paper size updated', { trayName, paperSize });
      return true;
    } catch (error) {
      logger.error('Failed to set tray paper size', { trayName, paperSize, error: String(error) });
      return false;
    }
  }

  static async hasEnoughPaper(trayName: string, requiredSheets: number): Promise<boolean> {
    try {
      const trays = await getPaperTrays();
      const tray = trays.find((t) => t.tray_name === trayName);
      return tray ? tray.current_count >= requiredSheets : false;
    } catch (error) {
      logger.error('Failed to check paper availability', { trayName, requiredSheets, error: String(error) });
      return false;
    }
  }
}
