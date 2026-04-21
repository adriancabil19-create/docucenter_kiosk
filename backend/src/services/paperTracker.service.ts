import {
  getPaperTrays,
  updatePaperTray,
  decrementPaperTray,
  getLowPaperAlerts,
  PaperTrayRow,
} from '../database';
import { logger } from '../utils/logger';

export class PaperTrackerService {
  /**
   * Get all paper tray statuses
   */
  static getTrays(): PaperTrayRow[] {
    try {
      return getPaperTrays();
    } catch (error) {
      logger.error('Failed to get paper trays', { error: String(error) });
      return [];
    }
  }

  /**
   * Update paper tray with new counts (user inputs initial paper count)
   */
  static setTrayCapacity(trayName: string, maxCapacity: number): boolean {
    try {
      // Set current count to max capacity when user adds papers
      updatePaperTray(trayName, maxCapacity, maxCapacity);
      logger.info('Paper tray capacity updated', { trayName, maxCapacity });
      return true;
    } catch (error) {
      logger.error('Failed to set tray capacity', { trayName, maxCapacity, error: String(error) });
      return false;
    }
  }

  /**
   * Decrement paper count (to be called when printing)
   */
  static async usePaper(trayName: string, sheets: number): Promise<boolean> {
    try {
      decrementPaperTray(trayName, sheets);
      logger.info('Paper used from tray', { trayName, sheets });
      return true;
    } catch (error) {
      logger.error('Failed to decrement paper count', { trayName, sheets, error: String(error) });
      return false;
    }
  }

  /**
   * Get trays that are low on paper (for admin alerts)
   */
  static getLowPaperAlerts(): Array<{
    tray_name: string;
    current_count: number;
    threshold: number;
  }> {
    try {
      return getLowPaperAlerts();
    } catch (error) {
      logger.error('Failed to get low paper alerts', { error: String(error) });
      return [];
    }
  }

  /**
   * Check if a specific tray has enough paper
   */
  static hasEnoughPaper(trayName: string, requiredSheets: number): boolean {
    try {
      const trays = getPaperTrays();
      const tray = trays.find((t) => t.tray_name === trayName);
      return tray ? tray.current_count >= requiredSheets : false;
    } catch (error) {
      logger.error('Failed to check paper availability', {
        trayName,
        requiredSheets,
        error: String(error),
      });
      return false;
    }
  }
}
