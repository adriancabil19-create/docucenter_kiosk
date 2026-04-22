import { Router, Request, Response } from 'express';
import {
  scanDocument,
  scanAllPages,
  photocopyDocument,
  checkADFStatus,
  createPhotocopySession,
  executePhotocopySession,
} from '../services/scan.service';
import { logger } from '../utils/logger';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';

const router = Router();

// Configure multer for file uploads (if needed for scanned documents)
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/scan
// Scan a document using the connected scanner
// ─────────────────────────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  try {
    const { colorMode = 'color', dpi = 300, paperSize = 'A4', outputFormat = 'pdf' } = req.body;

    logger.info('Scan request received', { colorMode, dpi, paperSize, outputFormat });

    const result = await scanDocument({
      colorMode,
      dpi: Number(dpi),
      paperSize,
      outputFormat,
    });

    if (result.success && result.filePath) {
      // Return the scanned file
      const fileName = path.basename(result.filePath);
      res.setHeader('Content-Type', outputFormat === 'pdf' ? 'application/pdf' : 'image/jpeg');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

      const fileStream = fs.createReadStream(result.filePath);
      fileStream.pipe(res);

      // Clean up temp file after sending
      fileStream.on('end', () => {
        try {
          fs.unlinkSync(result.filePath!);
        } catch (err) {
          logger.warn('Failed to clean up temp scan file', { filePath: result.filePath });
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Scan failed',
      });
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Scan endpoint error', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Internal server error during scanning',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/scan/all
// Scan ALL pages loaded in the ADF at once; returns base64 JPEG array.
// Used by the "Start Scanning with ADF" button in the document scan workflow.
// ─────────────────────────────────────────────────────────────────────────────

router.post('/all', async (req: Request, res: Response) => {
  try {
    const { colorMode = 'color', dpi = 300 } = req.body;
    logger.info('Scan all ADF pages request', { colorMode, dpi });

    const result = await scanAllPages({ colorMode, dpi: Number(dpi) });

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    const pages = result.pages.map((buf) => buf.toString('base64'));
    res.json({ success: true, pageCount: pages.length, pages });
  } catch (error) {
    const err = error as Error;
    logger.error('Scan all endpoint error', { error: err.message });
    res.status(500).json({ success: false, error: 'Internal server error during scanning' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/scan/adf-status
// Check if the Brother MFC-J2730DW ADF is ready for scanning
// ─────────────────────────────────────────────────────────────────────────────

router.get('/adf-status', async (req: Request, res: Response) => {
  try {
    logger.info('ADF status check requested');

    const result = await checkADFStatus();

    res.json({
      ready: result.ready,
      status: result.status,
      error: result.error,
    });
  } catch (error) {
    const err = error as Error;
    logger.error('ADF status check error', { error: err.message });
    res.status(500).json({
      ready: false,
      status: 'Please place your document on the scanner, thank you.',
      error: 'Could not check ADF status',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/photocopy
// Perform photocopying using the printer's copy functionality
// ─────────────────────────────────────────────────────────────────────────────

router.post('/photocopy', async (req: Request, res: Response) => {
  try {
    const { copies = 1, colorMode = 'bw', paperSize = 'A4', quality = 'normal' } = req.body;

    logger.info('Photocopy request received', { copies, colorMode, paperSize, quality });

    const result = await photocopyDocument({
      copies: Number(copies),
      colorMode,
      paperSize,
      quality,
    });

    if (result.success) {
      res.json({
        success: true,
        jobId: result.jobId,
        message: `Photocopy job ${result.jobId} submitted successfully`,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Photocopy failed',
      });
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Photocopy endpoint error', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Internal server error during photocopying',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/scan/photocopy-prepare
// Phase 1: scan all ADF pages and store as a session.
// Call before the payment screen; returns sessionId + pageCount.
// ─────────────────────────────────────────────────────────────────────────────

router.post('/photocopy-prepare', async (req: Request, res: Response) => {
  try {
    const { colorMode = 'color', quality = 'standard' } = req.body;
    logger.info('Photocopy prepare request', { colorMode, quality });

    const result = await createPhotocopySession({ colorMode, quality });

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true, sessionId: result.sessionId, pageCount: result.pageCount });
  } catch (error) {
    const err = error as Error;
    logger.error('Photocopy prepare error', { error: err.message });
    res.status(500).json({ success: false, error: 'Internal server error during scanning' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/scan/photocopy-execute
// Phase 2: print a previously scanned session after payment succeeds.
// Body: { sessionId, copies, paperSize, colorMode, quality }
// ─────────────────────────────────────────────────────────────────────────────

router.post('/photocopy-execute', async (req: Request, res: Response) => {
  try {
    const {
      sessionId,
      copies = 1,
      paperSize = 'A4',
      colorMode = 'bw',
      quality = 'standard',
    } = req.body;

    if (!sessionId) {
      res.status(400).json({ success: false, error: 'sessionId is required' });
      return;
    }

    logger.info('Photocopy execute request', { sessionId, copies, paperSize, colorMode, quality });

    const result = await executePhotocopySession({
      sessionId,
      copies: Number(copies),
      paperSize,
      colorMode,
      quality,
    });

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true, jobId: result.jobId });
  } catch (error) {
    const err = error as Error;
    logger.error('Photocopy execute error', { error: err.message });
    res.status(500).json({ success: false, error: 'Internal server error during printing' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/scan/status
// Get scanner status (placeholder for future implementation)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/scan/status', async (req: Request, res: Response) => {
  // In a real implementation, this would check scanner connectivity
  res.json({
    success: true,
    scannerAvailable: true,
    message: 'Scanner is ready',
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/scan/combine-pdf
// Combine multiple scanned images into a single PDF
// ─────────────────────────────────────────────────────────────────────────────

router.post('/combine-pdf', upload.array('images'), async (req: Request, res: Response) => {
  try {
    const { documentName } = req.body;
    const files = req.files as Array<{ path: string }>;

    if (!files || files.length === 0) {
      res.status(400).json({ success: false, error: 'No images provided' });
      return;
    }

    logger.info('Combine PDF request received', { documentName, imageCount: files.length });

    // Create PDF from images
    const PDFDocument = require('pdfkit');
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    const tempPdfPath = path.join(os.tmpdir(), `combined_${Date.now()}.pdf`);
    const doc = new PDFDocument({ autoFirstPage: false });

    const stream = fs.createWriteStream(tempPdfPath);
    doc.pipe(stream);

    // Add each image as a page
    for (const file of files) {
      const imageBuffer = fs.readFileSync(file.path);

      // Create a new page for each image
      doc.addPage({
        size: 'A4',
        margin: 0,
      });

      // Add image to fit the page
      doc.image(imageBuffer, 0, 0, {
        width: doc.page.width,
        height: doc.page.height,
        align: 'center',
        valign: 'center',
      });

      // Clean up temp image file
      fs.unlinkSync(file.path);
    }

    doc.end();

    // Wait for PDF creation to complete
    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    // Read the created PDF
    const pdfBuffer = fs.readFileSync(tempPdfPath);

    // Upload to storage (simulate for now)
    const finalFileName = documentName ? `${documentName}.pdf` : `Scanned_${Date.now()}.pdf`;

    // Clean up temp PDF
    fs.unlinkSync(tempPdfPath);

    logger.info('PDF combined successfully', { finalFileName, pageCount: files.length });

    res.json({
      success: true,
      message: 'PDF created and saved successfully',
      fileName: finalFileName,
      pageCount: files.length,
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Combine PDF endpoint error', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Internal server error during PDF creation',
    });
  }
});

export default router;
