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
  isDuplexCapablePaperSize,
  ImageLayoutOptions,
  PrintResult,
  VALID_IMAGES_PER_PAGE,
} from '../services/print.service';
import { logger } from '../utils/logger';
import {
  insertPrintJob,
  updatePrintJobResult,
  getPrintJobById,
  getTransactionById,
  getStaffRowById,
  nowIso,
  PRINT_RECOVERY_REASON_LABELS,
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
    // Resolved once, server-side — never trust the client's duplex flag on
    // its own, since the printer's duplexer can't handle Folio ("long")
    // paper (see isDuplexCapablePaperSize).
    const wantDuplex = (duplex === true || duplex === 'true') && isDuplexCapablePaperSize(paperSize);

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

    const txnId = typeof transactionId === 'string' && transactionId ? transactionId : undefined;

    // The Printing page repeats the file list once per copy (so copies come
    // out collated) and sends copies=1. Record the document once with the
    // customer's real copy count; the printer still gets the repeated list.
    const customerCopies = Math.max(1, parseInt(String(req.body.customerCopies ?? '1'), 10) || 1);
    const baseLength = filenames.length / customerCopies;
    const isRepeatedList =
      !layout &&
      numCopies === 1 &&
      customerCopies > 1 &&
      Number.isInteger(baseLength) &&
      (filenames as string[]).every((f, i) => f === filenames[i % baseLength]);
    const recordFilenames: string[] = isRepeatedList ? filenames.slice(0, baseLength) : filenames;
    const recordCopies = isRepeatedList ? customerCopies : numCopies;

    // Image layouts can drop unprintable images, so their real page count is
    // only known after printing — start from an estimate and correct it below.
    const perPage = layout && VALID_IMAGES_PER_PAGE.has(layout.imagesPerPage) ? layout.imagesPerPage : 1;
    const recordPages = layout
      ? Math.ceil(filenames.length / perPage)
      : (await Promise.all(recordFilenames.map(countPages))).reduce((s: number, p: number) => s + p, 0);

    let recordUnitPrice = typeof unitPrice === 'number' ? unitPrice : Number(unitPrice) || 0;
    if (!recordUnitPrice && txnId && recordPages > 0) {
      const txn = await getTransactionById(txnId);
      if (txn && Number(txn.amount) > 0) {
        recordUnitPrice = Math.round((Number(txn.amount) / (recordPages * recordCopies)) * 10000) / 10000;
      }
    }

    // Persist what was paid for BEFORE touching the printer. If the process
    // dies mid-print, or the printer fails without reporting it, this row is
    // what Staff Print Recovery works from.
    const jobId = randomUUID();
    let recorded = true;
    try {
      await insertPrintJob({
        id: jobId,
        transaction_id: txnId,
        filenames: recordFilenames,
        paper_size: paperSize ?? 'A4',
        copies: recordCopies,
        status: 'printing',
        simulated: false,
        page_count: recordPages,
        color_mode: colorMode === 'color' ? 'color' : 'bw',
        duplex: wantDuplex,
        unit_price: recordUnitPrice,
        service_type:
          typeof serviceType === 'string' ? serviceType : layout ? 'image-print' : 'printing',
        billing_type: 'paid',
        quality: typeof quality === 'string' ? quality : 'standard',
        printer_name: config.print.printerName || null,
        started_at: nowIso(),
      });
    } catch (recordErr) {
      // Still print — the customer has paid. Retried as a full insert below.
      recorded = false;
      logger.error('Could not record print job before printing', { jobId, error: String(recordErr) });
    }

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
      totalPages = result.pagesGenerated ?? recordPages;
    } else {
      totalPages = isRepeatedList ? recordPages * customerCopies : recordPages;
      result = await printFilesFromStorage(filenames, paperSize, colorMode, quality, numCopies, wantDuplex);
    }

    const outcome = {
      status: (result.success ? 'submitted' : 'failed') as 'submitted' | 'failed',
      method: result.method,
      simulated: !!(result.simulatedPaths && result.simulatedPaths.length > 0),
      printer_name: result.printerName ?? null,
      printer_job_id: result.jobID ?? null,
      completed_at: result.success ? nowIso() : null,
      error_message: result.error ?? null,
      page_count: layout ? totalPages : undefined,
    };
    try {
      if (recorded) {
        await updatePrintJobResult({ id: jobId, ...outcome });
      } else {
        await insertPrintJob({
          id: jobId,
          transaction_id: txnId,
          filenames: recordFilenames,
          paper_size: paperSize ?? 'A4',
          copies: recordCopies,
          page_count: layout ? totalPages : recordPages,
          color_mode: colorMode === 'color' ? 'color' : 'bw',
          duplex: wantDuplex,
          unit_price: recordUnitPrice,
          service_type:
            typeof serviceType === 'string' ? serviceType : layout ? 'image-print' : 'printing',
          billing_type: 'paid',
          quality: typeof quality === 'string' ? quality : 'standard',
          ...outcome,
          printer_name: outcome.printer_name ?? (config.print.printerName || null),
        });
      }
    } catch (recordErr) {
      logger.error('Could not record print result', { jobId, error: String(recordErr) });
    }

    if (result.success) {
      const resp: Record<string, unknown> = {
        success: true,
        jobID: jobId,
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
        // Duplex prints two pages per physical sheet — round up so an odd
        // trailing page (which prints on its own, single-sided) still
        // counts as one sheet.
        const sheetsUsed = wantDuplex
          ? Math.ceil(totalPages / 2) * numCopies
          : totalPages * numCopies;

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
            jobID: jobId,
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
// Customer already paid but the physical print didn't come out — jam, out of
// ink, wrong output, whatever the software may or may not have noticed —
// staff reprints without asking the customer to pay again. Deliberately
// narrow: only a transaction with a paid print job is reprintable, only
// within the configured recency window, and only once per transaction
// unless an Admin reauthorizes it (see database.ts's
// getRecoverableTransactions/reauthorizeRecovery).

const VALID_RECOVERY_REASONS = Object.keys(PRINT_RECOVERY_REASON_LABELS) as PrintRecoveryReason[];

/**
 * GET /api/print/recoverable?search=
 * Paid transactions Staff Mode may recover right now, full details included.
 * Search matches transaction id, payment reference, document name, or date.
 */
router.get('/recoverable', async (req: Request, res: Response): Promise<void> => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const recoverable = await getRecoverableTransactions({ search });
    res.json({ success: true, recoverable, count: recoverable.length });
  } catch (error) {
    const err = error as Error;
    logger.error('Recoverable-transactions endpoint error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/print/recover/:transactionId
 * Print Recovery / Payment Bypass: reprint a paid transaction at no extra
 * charge. The original transaction and print job are never modified — this
 * adds a linked recovery event and a new billing_type='recovery' job.
 */
router.post('/recover/:transactionId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { transactionId } = req.params;
    const { reason, reasonNote, staffId } = req.body as {
      reason?: string;
      reasonNote?: string;
      staffId?: string;
    };

    // Identity comes from the staff table, never from a name the client sends.
    const staff = staffId ? await getStaffRowById(staffId) : null;
    if (!staff || staff.status !== 'active') {
      res.status(403).json({ success: false, error: 'A signed-in, active staff account is required.' });
      return;
    }
    if (!reason || !VALID_RECOVERY_REASONS.includes(reason as PrintRecoveryReason)) {
      res.status(400).json({ success: false, error: `reason must be one of: ${VALID_RECOVERY_REASONS.join(', ')}` });
      return;
    }
    const note = reasonNote?.trim() || undefined;
    if (reason === 'other' && !note) {
      res.status(400).json({ success: false, error: 'Please explain the reason when "Other" is selected.' });
      return;
    }

    // Eligibility is re-checked server-side, not trusted from the kiosk's list.
    const [detail] = await getRecoverableTransactions({ transactionId });
    const originalJob = detail?.print_job_id ? await getPrintJobById(detail.print_job_id) : null;
    if (!detail || !originalJob) {
      res.status(409).json({ success: false, error: 'This transaction is not currently eligible for recovery.' });
      return;
    }

    // Photocopy scans are deleted right after printing, so there is nothing
    // on file to reprint — the customer's originals have to be re-scanned.
    if (originalJob.service_type === 'photocopying') {
      res.status(409).json({
        success: false,
        error:
          'Photocopy jobs cannot be auto-reprinted — the scanned pages are not kept on file. ' +
          'Ask the customer to bring their original documents back to the ADF and re-scan.',
      });
      return;
    }

    const reasonLabel = PRINT_RECOVERY_REASON_LABELS[reason as PrintRecoveryReason];
    const action = await createRecoveryAction({
      transactionId,
      originalPrintJobId: originalJob.id,
      staffId: staff.id,
      staffName: staff.name,
      reason: reason as PrintRecoveryReason,
      reasonNote: note,
      pages: originalJob.page_count ?? 0,
      copies: originalJob.copies,
    });

    // Same stored files and settings as the paid job. Copies are sent as a
    // repeated list, matching how the Printing page sends them. N-up image
    // layouts aren't stored, so image prints come back one image per page.
    const reprintFiles = Array.from({ length: Math.max(1, originalJob.copies) }, () => originalJob.filenames).flat();
    const quality = originalJob.quality || 'standard';
    const recoveryJobId = randomUUID();
    await insertPrintJob({
      id: recoveryJobId,
      transaction_id: transactionId,
      filenames: originalJob.filenames,
      paper_size: originalJob.paper_size,
      copies: originalJob.copies,
      status: 'printing',
      simulated: false,
      page_count: originalJob.page_count,
      color_mode: originalJob.color_mode,
      duplex: originalJob.duplex,
      unit_price: 0,
      service_type: originalJob.service_type,
      billing_type: 'recovery',
      quality,
      printer_name: config.print.printerName || null,
      started_at: nowIso(),
    });
    await setRecoveryActionResult(action.id, 'pending', recoveryJobId);

    const result = await printFilesFromStorage(
      reprintFiles,
      originalJob.paper_size,
      originalJob.color_mode,
      quality,
      1,
      originalJob.duplex,
    );

    await updatePrintJobResult({
      id: recoveryJobId,
      status: result.success ? 'submitted' : 'failed',
      method: result.method,
      simulated: !!(result.simulatedPaths && result.simulatedPaths.length > 0),
      printer_name: result.printerName ?? null,
      printer_job_id: result.jobID ?? null,
      completed_at: result.success ? nowIso() : null,
      error_message: result.error ?? null,
    });
    await setRecoveryActionResult(action.id, result.success ? 'success' : 'failed', recoveryJobId);

    if (result.success) {
      try {
        const sheetsUsed = originalJob.duplex
          ? Math.ceil((originalJob.page_count ?? 0) / 2) * originalJob.copies
          : (originalJob.page_count ?? 0) * originalJob.copies;
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

    const totalPages = (originalJob.page_count ?? 0) * originalJob.copies;
    await insertLog(
      'warn',
      'print-recovery',
      `${staff.username} performed Print Recovery / Payment Bypass on transaction ${transactionId}`,
      {
        actor: staff.username,
        staffId: staff.id,
        staffName: staff.name,
        recoveryId: action.id,
        transactionId,
        paymentReference: detail.reference_number,
        amountPaid: detail.amount,
        additionalPayment: 0,
        originalPrintJobId: originalJob.id,
        recoveryPrintJobId: recoveryJobId,
        reason,
        reasonLabel,
        reasonNote: note,
        documents: originalJob.filenames,
        pages: originalJob.page_count,
        copies: originalJob.copies,
        totalPages,
        result: result.success ? 'reprint_sent' : 'reprint_failed',
        error: result.success ? undefined : result.error,
      },
    );

    sendPushToAll(
      {
        title: 'Payment bypass: print recovery',
        body:
          `${staff.name} (${staff.username}) reprinted ${transactionId} at ₱0.00 ` +
          `(paid ₱${detail.amount.toFixed(2)}, ${totalPages} page${totalPages === 1 ? '' : 's'}): ${reasonLabel}`,
        url: '/transactions',
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
