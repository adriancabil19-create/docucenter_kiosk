import { Router, Request, Response } from 'express';
import { printText, printReceipt, printDocument, getAvailablePrinters } from '../services/print.service';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/print
 * Print raw text content
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { content, type } = req.body;

    if (!content) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: content',
      });
      return;
    }

    logger.info('Print request received', { contentLength: content.length });

    const result = await printText(content, { type: type || 'RAW' });

    if (result.success) {
      res.json({
        success: true,
        jobID: result.jobID,
        message: 'Print job submitted successfully',
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Print endpoint error', { error: err.message });
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/print/receipt
 * Print receipt content
 */
router.post('/receipt', async (req: Request, res: Response): Promise<void> => {
  try {
    const { content } = req.body;

    if (!content) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: content',
      });
      return;
    }

    logger.info('Receipt print request received', { contentLength: content.length });

    const result = await printReceipt(content);

    if (result.success) {
      res.json({
        success: true,
        jobID: result.jobID,
        message: 'Receipt print job submitted successfully',
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Receipt print endpoint error', { error: err.message });
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/print/document
 * Print document content
 */
router.post('/document', async (req: Request, res: Response): Promise<void> => {
  try {
    const { content, documentName } = req.body;

    if (!content) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: content',
      });
      return;
    }

    logger.info('Document print request received', { documentName, contentLength: content.length });

    const result = await printDocument(content, documentName);

    if (result.success) {
      res.json({
        success: true,
        jobID: result.jobID,
        message: 'Document print job submitted successfully',
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Document print endpoint error', { error: err.message });
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/print/printers
 * Get list of available printers
 */
router.get('/printers', async (req: Request, res: Response) => {
  try {
    logger.info('Printers list request received');

    const printers = await getAvailablePrinters();

    res.json({
      success: true,
      printers,
      count: printers.length,
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Printers endpoint error', { error: err.message });
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

export default router;
