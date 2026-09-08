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
import { insertPrintJob, getKioskById, getStorageSettings, insertLog } from '../database';
import { config } from '../utils/config';
import { deleteDocument } from '../services/storage.service';
import { PaperTrackerService } from '../services/paperTracker.service';
import { PDFDocument as PDFLib } from 'pdf-lib';

/** Uploads directory — mirrors the path used in print.service.ts */
const uploadsDir = path.resolve(__dirname, '../../../Uploads');

/** Count pages in a PDF file; returns 1 for non-PDFs or on error. */
async function countPages(filename: string): Promise<number> {
  const ext = path.extname(filename).toLowerCase();
  if (ext !== '.pdf') return 1;
  try {
    const bytes = fs.readFileSync(path.join(uploadsDir, filename));
    const doc = await PDFLib.load(bytes, { ignoreEncryption: true });
    return Math.max(1, doc.getPageCount());
  } catch {
    return 1;
  }
}

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
    const { filenames, paperSize, colorMode, quality, copies, duplex, serviceType, unitPrice } =
      req.body;
    const numCopies: number = Math.max(1, parseInt(String(copies ?? '1'), 10) || 1);

    if (!filenames || !Array.isArray(filenames) || filenames.length === 0) {
      res.status(400).json({ success: false, error: 'Missing required field: filenames' });
      return;
    }

    // Server-side enforcement: admin may have disabled printing on this kiosk.
    const selfKiosk = await getKioskById(config.kioskId);
    if (selfKiosk?.printing_disabled || selfKiosk?.maintenance) {
      logger.warn('Print request refused — kiosk locked', {
        printingDisabled: selfKiosk?.printing_disabled,
        maintenance: selfKiosk?.maintenance,
      });
      res.status(423).json({
        success: false,
        error: selfKiosk?.maintenance
          ? 'Kiosk is in maintenance mode'
          : 'Printing is temporarily disabled by the administrator',
      });
      return;
    }

    logger.info('Print from storage request received', {
      count: filenames.length,
      copies: numCopies,
      paperSize,
      colorMode,
      quality,
    });

    // Page count is needed both for the job record and paper tracking — compute once.
    const pageCounts = await Promise.all(filenames.map(countPages));
    const totalPages = pageCounts.reduce((s: number, p: number) => s + p, 0);

    const result = await printFilesFromStorage(filenames, paperSize, colorMode, quality, numCopies);

    // Log to SQLite regardless of outcome
    await insertPrintJob({
      id: result.jobID ?? randomUUID(),
      filenames,
      paper_size: paperSize ?? 'A4',
      copies: numCopies,
      status: result.success ? 'submitted' : 'failed',
      method: result.method,
      simulated: !!(result.simulatedPaths && result.simulatedPaths.length > 0),
      page_count: totalPages,
      color_mode: colorMode === 'color' ? 'color' : 'bw',
      duplex: duplex === true || duplex === 'true',
      unit_price: typeof unitPrice === 'number' ? unitPrice : Number(unitPrice) || 0,
      service_type: typeof serviceType === 'string' ? serviceType : 'printing',
    });

    if (result.success) {
      const resp: Record<string, unknown> = {
        success: true,
        jobID: result.jobID,
        method: result.method,
        message: 'Print job submitted (from storage)',
      };
      if (result.simulatedPaths) resp.simulatedPaths = result.simulatedPaths;

      // Delete-after-print, if the retention policy asks for it.
      try {
        const { delete_after_print } = await getStorageSettings();
        if (delete_after_print) {
          for (const f of filenames as string[]) await deleteDocument(f);
          logger.info('Deleted files after successful print', { count: filenames.length });
        }
      } catch (delErr) {
        logger.warn('delete-after-print failed', { error: String(delErr) });
      }

      // Decrement the correct tray: match by paper size, then by most paper available
      try {
        const sheetsUsed = totalPages * numCopies;

        const normalizedSize = (paperSize ?? 'A4').toUpperCase();
        const allTrays = await PaperTrackerService.getTrays();
        const withPaper = allTrays.filter((t) => t.current_count > 0);

        // Prefer a tray loaded with the matching paper size
        const sizeMatch = withPaper
          .filter((t) => (t.paper_size ?? 'A4').toUpperCase() === normalizedSize)
          .sort((a, b) => b.current_count - a.current_count)[0];

        // Fall back to whatever tray has the most paper
        const fallback = withPaper.sort((a, b) => b.current_count - a.current_count)[0];

        const tray = sizeMatch ?? fallback;
        const trayName = tray?.tray_name ?? 'Tray 1';

        await PaperTrackerService.usePaper(trayName, sheetsUsed);
        // One activity-log entry per print job — this is the only paper event
        // worth persisting (routine tray edits no longer log).
        await insertLog(
          'info',
          'paper',
          `Print job used ${sheetsUsed} sheet(s) from ${trayName}`,
          {
            jobID: result.jobID,
            tray: trayName,
            paperSize: normalizedSize,
            pages: totalPages,
            copies: numCopies,
            sheets: sheetsUsed,
          },
        );
      } catch (paperError) {
        logger.warn('Failed to update paper tracking after print', { error: String(paperError) });
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
