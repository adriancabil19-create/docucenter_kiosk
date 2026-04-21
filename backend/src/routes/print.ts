import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  printText,
  printReceipt,
  printDocument,
  getAvailablePrinters,
  printFilesFromStorage,
  printTestPage,
} from '../services/print.service';
import { logger } from '../utils/logger';
import { insertPrintJob } from '../database';
import { PaperTrackerService } from '../services/paperTracker.service';

const router = Router();

/**
 * POST /api/upload-scanned
 * Upload scanned images from Flutter app
 */
router.post('/upload-scanned', async (req: Request, res: Response): Promise<void> => {
  try {
    const { images } = req.body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      res.status(400).json({ success: false, error: 'Missing required field: images' });
      return;
    }

    const filenames: string[] = [];
    const uploadsDir = path.join(__dirname, '../../uploads');

    // Ensure uploads directory exists
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    for (let i = 0; i < images.length; i++) {
      const imageData = images[i];
      const filename = `scanned_${Date.now()}_${i}.png`;
      const filepath = path.join(uploadsDir, filename);

      // Decode base64 and save as file
      const buffer = Buffer.from(imageData, 'base64');
      fs.writeFileSync(filepath, buffer);
      filenames.push(filename);
    }

    logger.info('Scanned images uploaded', { count: filenames.length });
    res.json({ success: true, filenames });
  } catch (error) {
    const err = error as Error;
    logger.error('Upload scanned images error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/print
 * Print raw text content
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { content, paperSize } = req.body;

    if (!content) {
      res.status(400).json({ success: false, error: 'Missing required field: content' });
      return;
    }

    logger.info('Print request received', { contentLength: content.length, paperSize });
    const result = await printText(content, { paperSize });

    if (result.success) {
      res.json({
        success: true,
        jobID: result.jobID,
        method: result.method,
        message: 'Print job submitted successfully',
      });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Print endpoint error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/print/receipt
 * Print receipt content
 */
router.post('/receipt', async (req: Request, res: Response): Promise<void> => {
  try {
    const { content, paperSize } = req.body;

    if (!content) {
      res.status(400).json({ success: false, error: 'Missing required field: content' });
      return;
    }

    logger.info('Receipt print request received', { contentLength: content.length, paperSize });
    const result = await printReceipt(content, paperSize);

    if (result.success) {
      res.json({
        success: true,
        jobID: result.jobID,
        method: result.method,
        message: 'Receipt printed successfully',
      });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Receipt print endpoint error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/print/document
 * Print document content
 */
router.post('/document', async (req: Request, res: Response): Promise<void> => {
  try {
    const { content, documentName, paperSize } = req.body;

    if (!content) {
      res.status(400).json({ success: false, error: 'Missing required field: content' });
      return;
    }

    logger.info('Document print request received', {
      documentName,
      contentLength: content.length,
      paperSize,
    });
    const result = await printDocument(content, documentName, paperSize);

    if (result.success) {
      res.json({
        success: true,
        jobID: result.jobID,
        method: result.method,
        message: 'Document printed successfully',
      });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Document print endpoint error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/print/from-storage
 * Print files previously uploaded to storage by filename(s)
 */
router.post('/from-storage', async (req: Request, res: Response): Promise<void> => {
  try {
    const { filenames, paperSize, colorMode, quality } = req.body;

    if (!filenames || !Array.isArray(filenames) || filenames.length === 0) {
      res.status(400).json({ success: false, error: 'Missing required field: filenames' });
      return;
    }

    logger.info('Print from storage request received', {
      count: filenames.length,
      paperSize,
      colorMode,
      quality,
    });
    const result = await printFilesFromStorage(filenames, paperSize, colorMode, quality);

    // Log to SQLite regardless of outcome
    insertPrintJob({
      id: result.jobID ?? randomUUID(),
      filenames,
      paper_size: paperSize ?? 'A4',
      copies: 1,
      status: result.success ? 'submitted' : 'failed',
      method: result.method,
      simulated: !!(result.simulatedPaths && result.simulatedPaths.length > 0),
    });

    if (result.success) {
      const resp: Record<string, unknown> = {
        success: true,
        jobID: result.jobID,
        method: result.method,
        message: 'Print job submitted (from storage)',
      };
      if (result.simulatedPaths) resp.simulatedPaths = result.simulatedPaths;

      // Add paper tracking: decrement from default tray (Tray 1) for each file printed
      // Assuming 1 sheet per file for now - this can be enhanced later
      try {
        const sheetsUsed = filenames.length; // 1 sheet per file
        const defaultTray = 'Tray 1'; // Default tray for printing
        await PaperTrackerService.usePaper(defaultTray, sheetsUsed);
        logger.info('Paper tracking updated after print', {
          tray: defaultTray,
          sheets: sheetsUsed,
        });
      } catch (paperError) {
        logger.warn('Failed to update paper tracking after print', { error: String(paperError) });
        // Don't fail the print job if paper tracking fails
      }

      res.json(resp);
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    const err = error as Error;
    logger.error('From-storage print endpoint error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/print/test
 * Print a test page to verify printer is working
 */
router.post('/test', async (req: Request, res: Response): Promise<void> => {
  try {
    const { paperSize } = req.body;
    logger.info('Test print request received', { paperSize });
    const result = await printTestPage(paperSize);

    if (result.success) {
      res.json({
        success: true,
        jobID: result.jobID,
        method: result.method,
        message: 'Test page printed successfully',
        simulatedPaths: result.simulatedPaths,
      });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Test print endpoint error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/print/printers
 * Get list of available printers with their supported paper sizes
 */
router.get('/printers', async (_req: Request, res: Response) => {
  try {
    logger.info('Printers list request received');
    const printers = await getAvailablePrinters();
    res.json({ success: true, printers, count: printers.length });
  } catch (error) {
    const err = error as Error;
    logger.error('Printers endpoint error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
