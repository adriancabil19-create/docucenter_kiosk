import { Router, Request, Response } from 'express';
import multer from 'multer';
import {
  saveFile,
  getAllDocuments,
  getDocument,
  getFileBuffer,
  deleteDocument,
  getStorageStats,
} from '../services/storage.service';
import { logger } from '../utils/logger';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024, // 200 MB limit
  },
});

/**
 * POST /api/storage/upload
 * Upload a file to storage
 */
router.post(
  '/upload',
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const file = (req as any).file;

      if (!file) {
        res.status(400).json({
          success: false,
          error: 'No file provided',
        });
        return;
      }

      logger.info('File upload request received', {
        filename: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
      });

      const result = await saveFile(file.buffer, file.originalname, file.mimetype);

      if (result.success) {
        res.json({
          success: true,
          document: result.data,
          message: 'File uploaded successfully',
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      const err = error as Error;
      logger.error('File upload endpoint error', { error: err.message });
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  },
);

/**
 * GET /api/storage/documents
 * Get all stored documents
 */
router.get('/documents', async (_req: Request, res: Response): Promise<void> => {
  try {
    logger.info('Get all documents request received');

    const result = await getAllDocuments();

    if (result.success) {
      res.json({
        success: true,
        documents: result.data,
        count: Array.isArray(result.data) ? result.data.length : 0,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Get documents endpoint error', { error: err.message });
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/storage/documents/:filename
 * Get specific document metadata
 */
router.get('/documents/:filename', async (req: Request, res: Response): Promise<void> => {
  try {
    const filename = req.params.filename;

    logger.info('Get document request received', { filename });

    const result = await getDocument(filename);

    if (result.success) {
      res.json({
        success: true,
        document: result.data,
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Get document endpoint error', { error: err.message });
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/storage/download/:filename
 * Download file
 */
router.get('/download/:filename', async (req: Request, res: Response): Promise<void> => {
  try {
    const filename = req.params.filename;

    logger.info('Download request received', { filename });

    const fileResult = await getFileBuffer(filename);

    if (!fileResult.success) {
      res.status(404).json({
        success: false,
        error: fileResult.error,
      });
      return;
    }

    // Set headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(fileResult.buffer);

    logger.info('File downloaded', { filename });
  } catch (error) {
    const err = error as Error;
    logger.error('Download endpoint error', { error: err.message });
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * DELETE /api/storage/documents/:filename
 * Delete a document from storage
 */
router.delete('/documents/:filename', async (req: Request, res: Response): Promise<void> => {
  try {
    const filename = req.params.filename;

    logger.info('Delete document request received', { filename });

    const result = await deleteDocument(filename);

    if (result.success) {
      res.json({
        success: true,
        message: 'Document deleted successfully',
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Delete document endpoint error', { error: err.message });
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/storage/stats
 * Get storage statistics
 */
router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    logger.info('Get storage stats request received');

    const result = await getStorageStats();

    if (result.success) {
      res.json({
        success: true,
        stats: result.stats,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Get stats endpoint error', { error: err.message });
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

export default router;
