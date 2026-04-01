import { Router, Request, Response } from 'express';
import { scanDocument, photocopyDocument } from '../services/scan.service';
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
    const {
      colorMode = 'color',
      dpi = 300,
      paperSize = 'A4',
      outputFormat = 'pdf'
    } = req.body;

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
// POST /api/photocopy
// Perform photocopying using the printer's copy functionality
// ─────────────────────────────────────────────────────────────────────────────

router.post('/photocopy', async (req: Request, res: Response) => {
  try {
    const {
      copies = 1,
      colorMode = 'bw',
      paperSize = 'A4',
      quality = 'normal'
    } = req.body;

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

export default router;