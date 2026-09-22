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
  printImageLayoutJob,
  printTestPage,
  ImageLayoutOptions,
  PrintResult,
  VALID_IMAGES_PER_PAGE,
} from '../services/print.service';
import { logger } from '../utils/logger';
import {
  insertPrintJob,
  getKioskById,
  getStorageSettings,
  insertLog,
  getRecoverableTransactions,
  createRecoveryAction,
  setRecoveryActionResult,
  getRecoveryActionById,
  type PrintRecoveryReason,
} from '../database';
import { config } from '../utils/config';
import { deleteDocument } from '../services/storage.service';
import { PaperTrackerService } from '../services/paperTracker.service';
import { sendPushToAll } from '../services/push.service';
import { syncEvent } from '../services/sync.service';
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

/** Hard cap on images in a single N-up print job — keeps job size sane on kiosk hardware.
 * Mirrored client-side in lib/pages/image_print_settings_page.dart (kMaxImagesPerPrintJob)
 * so the customer is stopped before paying for a job this would reject. */
const MAX_IMAGES = 30;

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
    const { content, paperSize, actor } = req.body;

    if (!content) {
      res.status(400).json({ success: false, error: 'Missing required field: content' });
      return;
    }

    logger.info('Receipt print request received', { contentLength: content.length, paperSize });
    const result = await printReceipt(content, paperSize);

    // `actor` is only ever sent by Staff Mode's printer test screen — customer
    // receipt prints never include it, so this never fires for them.
    if (actor) {
      await insertLog('info', 'staff', `${actor} printed a test receipt`, { actor, paperSize });
    }

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
    const {
      filenames,
      paperSize,
      colorMode,
      quality,
      copies,
      duplex,
      serviceType,
      unitPrice,
      imageLayout,
      transactionId,
    } = req.body;
    const layout: ImageLayoutOptions | undefined = imageLayout ?? undefined;
    const numCopies: number = Math.max(1, parseInt(String(copies ?? '1'), 10) || 1);

    if (!filenames || !Array.isArray(filenames) || filenames.length === 0) {
      res.status(400).json({ success: false, error: 'Missing required field: filenames' });
      return;
    }

    if (layout && filenames.length > MAX_IMAGES) {
      res.status(400).json({
        success: false,
        error: `Too many images selected. Please select ${MAX_IMAGES} or fewer.`,
      });
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

    // Page count is needed both for the job record and paper tracking.
    // Image-layout jobs pack N images per sheet, and some requested images
    // can be dropped before ever reaching the PDF (corrupt, unsafe path,
    // deleted from disk) — so for those jobs we print first and use the
    // actual page count the layout produced, rather than estimating from
    // the originally requested filenames, which would overcount paper used
    // for images that never made it onto a page.
    let totalPages: number;
    let result: PrintResult;
    if (layout) {
      result = await printImageLayoutJob(filenames, {
        paperSize,
        colorMode,
        quality,
        copies: numCopies,
        ...layout,
      });
      const perPage = VALID_IMAGES_PER_PAGE.has(layout.imagesPerPage) ? layout.imagesPerPage : 1;
      totalPages = result.pagesGenerated ?? Math.ceil(filenames.length / perPage);
    } else {
      const pageCounts = await Promise.all(filenames.map(countPages));
      totalPages = pageCounts.reduce((s: number, p: number) => s + p, 0);
      result = await printFilesFromStorage(filenames, paperSize, colorMode, quality, numCopies);
    }

    // Log to SQLite regardless of outcome
    await insertPrintJob({
      id: result.jobID ?? randomUUID(),
      transaction_id: typeof transactionId === 'string' && transactionId ? transactionId : undefined,
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
      service_type:
        typeof serviceType === 'string' ? serviceType : layout ? 'image-print' : 'printing',
      billing_type: 'paid',
    });

    if (result.success) {
      const resp: Record<string, unknown> = {
        success: true,
        jobID: result.jobID,
        method: result.method,
        message: 'Print job submitted (from storage)',
      };
      if (result.simulatedPaths) resp.simulatedPaths = result.simulatedPaths;
      // Non-fatal note (e.g. some images were skipped) surfaced alongside success.
      if (result.error) resp.warning = result.error;

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
        const allTrays = await PaperTrackerService.getTrays(config.kioskId);
        const withPaper = allTrays.filter((t) => t.current_count > 0);

        // Prefer a tray loaded with the matching paper size
        const sizeMatch = withPaper
          .filter((t) => (t.paper_size ?? 'A4').toUpperCase() === normalizedSize)
          .sort((a, b) => b.current_count - a.current_count)[0];

        // Fall back to whatever tray has the most paper
        const fallback = withPaper.sort((a, b) => b.current_count - a.current_count)[0];

        const tray = sizeMatch ?? fallback;
        const trayName = tray?.tray_name ?? 'Tray 1';

        await PaperTrackerService.usePaper(config.kioskId, trayName, sheetsUsed);
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
    const { paperSize, actor } = req.body;
    logger.info('Test print request received', { paperSize });
    const result = await printTestPage(paperSize);

    // Only Staff Mode's printer test screen sends `actor` — this route has no
    // other caller, but keep the same opt-in shape as /receipt for consistency.
    if (actor) {
      await insertLog('info', 'staff', `${actor} printed a test page`, { actor, paperSize });
    }

    // Staff test prints previously left no print_jobs row at all — now
    // tracked (billing_type='staff_test') so they show up in monitoring
    // instead of being invisible.
    await insertPrintJob({
      id: result.jobID ?? randomUUID(),
      filenames: ['(staff test page)'],
      paper_size: paperSize ?? 'A4',
      copies: 1,
      status: result.success ? 'submitted' : 'failed',
      method: result.method,
      simulated: !!(result.simulatedPaths && result.simulatedPaths.length > 0),
      page_count: 1,
      unit_price: 0,
      service_type: 'printing',
      billing_type: 'staff_test',
    });

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

// ─── Staff Print Recovery ─────────────────────────────────────────────────────
// Customer already paid, printing failed, staff reprints without asking the
// customer to pay again. Deliberately narrow: only a paid transaction's own
// most-recently-failed print job is reprintable, only within the configured
// window, and only once per transaction unless an Admin reauthorizes it (see
// database.ts's getRecoverableTransactions/reauthorizeRecovery).

const VALID_RECOVERY_REASONS: PrintRecoveryReason[] = [
  'paper_jam',
  'printer_error',
  'incorrect_output',
  'power_interruption',
  'printer_offline',
  'other',
];

/**
 * GET /api/print/recoverable
 * Transactions Staff Mode may offer for recovery right now.
 */
router.get('/recoverable', async (_req: Request, res: Response): Promise<void> => {
  try {
    const recoverable = await getRecoverableTransactions();
    res.json({ success: true, recoverable, count: recoverable.length });
  } catch (error) {
    const err = error as Error;
    logger.error('Recoverable-transactions endpoint error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/print/recover/:transactionId
 * Reprint a paid transaction's failed job at no additional charge.
 */
router.post('/recover/:transactionId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { transactionId } = req.params;
    const { reason, reasonNote, actor, staffId } = req.body as {
      reason?: string;
      reasonNote?: string;
      actor?: string;
      staffId?: string;
    };

    if (!actor?.trim()) {
      res.status(400).json({ success: false, error: 'actor (staff name) is required' });
      return;
    }
    if (!reason || !VALID_RECOVERY_REASONS.includes(reason as PrintRecoveryReason)) {
      res.status(400).json({ success: false, error: `reason must be one of: ${VALID_RECOVERY_REASONS.join(', ')}` });
      return;
    }
    if (reason === 'other' && !reasonNote?.trim()) {
      res.status(400).json({ success: false, error: 'reasonNote is required when reason is "other"' });
      return;
    }

    // Re-derive eligibility server-side rather than trusting that the kiosk's
    // /recoverable list is still current — the same rule, checked again.
    const recoverable = await getRecoverableTransactions();
    const match = recoverable.find((r) => r.transaction.id === transactionId);
    if (!match) {
      res.status(409).json({ success: false, error: 'This transaction is not currently eligible for recovery.' });
      return;
    }
    const originalJob = match.printJob;

    const action = await createRecoveryAction({
      transactionId,
      originalPrintJobId: originalJob.id,
      staffId,
      staffName: actor.trim(),
      reason: reason as PrintRecoveryReason,
      reasonNote: reasonNote?.trim() || undefined,
      pages: originalJob.page_count ?? 0,
      copies: originalJob.copies,
    });

    // Reprint the same stored files at the same paper size/colour/copies.
    // Note: N-up image-layout arrangement isn't persisted on the original
    // job, so an image-print recovery reprints the source files individually
    // rather than reproducing the exact original layout.
    const result = await printFilesFromStorage(
      originalJob.filenames,
      originalJob.paper_size,
      originalJob.color_mode,
      'standard',
      originalJob.copies,
    );

    const recoveryJobId = result.jobID ?? randomUUID();
    await insertPrintJob({
      id: recoveryJobId,
      transaction_id: transactionId,
      filenames: originalJob.filenames,
      paper_size: originalJob.paper_size,
      copies: originalJob.copies,
      status: result.success ? 'submitted' : 'failed',
      method: result.method,
      simulated: !!(result.simulatedPaths && result.simulatedPaths.length > 0),
      page_count: originalJob.page_count,
      color_mode: originalJob.color_mode,
      duplex: originalJob.duplex,
      unit_price: 0,
      service_type: originalJob.service_type,
      billing_type: 'recovery',
    });
    await setRecoveryActionResult(action.id, result.success ? 'success' : 'failed', recoveryJobId);

    if (result.success) {
      try {
        const sheetsUsed = (originalJob.page_count ?? 0) * originalJob.copies;
        const normalizedSize = originalJob.paper_size.toUpperCase();
        const allTrays = await PaperTrackerService.getTrays(config.kioskId);
        const withPaper = allTrays.filter((t) => t.current_count > 0);
        const sizeMatch = withPaper
          .filter((t) => (t.paper_size ?? 'A4').toUpperCase() === normalizedSize)
          .sort((a, b) => b.current_count - a.current_count)[0];
        const fallback = withPaper.sort((a, b) => b.current_count - a.current_count)[0];
        const tray = sizeMatch ?? fallback;
        if (tray) await PaperTrackerService.usePaper(config.kioskId, tray.tray_name, sheetsUsed);
      } catch (paperError) {
        logger.warn('Failed to update paper tracking after recovery print', { error: String(paperError) });
      }
    }

    const finalAction = await getRecoveryActionById(action.id);
    if (finalAction) syncEvent('print-recovery', finalAction);

    await insertLog(
      'warn',
      'print-recovery',
      `${actor.trim()} used Recovery Print on transaction ${transactionId}`,
      {
        actor: actor.trim(),
        transactionId,
        originalPrintJobId: originalJob.id,
        recoveryPrintJobId: recoveryJobId,
        reason,
        reasonNote,
        pages: originalJob.page_count,
        copies: originalJob.copies,
        result: result.success ? 'success' : 'failed',
      },
    );

    sendPushToAll(
      {
        title: '🔔 Recovery Print Used',
        body: `${actor.trim()} reprinted transaction ${transactionId} (${originalJob.page_count ?? 0}p × ${originalJob.copies}) — ${reason}`,
        url: '/print-jobs',
      },
      { role: 'ADMIN' },
    );

    if (result.success) {
      res.json({ success: true, jobID: recoveryJobId, action: finalAction });
    } else {
      res.status(500).json({ success: false, error: result.error, action: finalAction });
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Print recovery endpoint error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
