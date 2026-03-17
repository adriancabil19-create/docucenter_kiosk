import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';

interface StorageDocument {
  id: string;
  name: string;
  originalName: string;
  format: string;
  pages: number;
  size: string;
  date: string;
  filePath: string;
  mimeType: string;
}

interface StorageResult {
  success: boolean;
  data?: StorageDocument | StorageDocument[];
  error?: string;
}

interface FileMeta {
  originalName: string;
  mimeType: string;
}

// Get the Uploads directory path (relative to project root)
const getUploadsDir = (): string => {
  const uploadsDir = path.resolve(__dirname, '../../..', 'Uploads');

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    logger.info('Created Uploads directory', { path: uploadsDir });
  }

  return uploadsDir;
};

/**
 * Safe path validation — guards against directory traversal
 */
const isSafePath = (filePath: string, baseDir: string): boolean => {
  const resolved = path.resolve(filePath);
  const base = path.resolve(baseDir);
  return resolved.startsWith(base + path.sep);
};

/**
 * Get file size in human-readable format
 */
const getFileSize = (sizeInBytes: number): string => {
  if (sizeInBytes < 1024) return `${sizeInBytes} B`;
  if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(1)} KB`;
  return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Get file format from filename
 */
const getFileFormat = (filename: string): string => {
  return path.extname(filename).replace('.', '').toUpperCase() || 'UNKNOWN';
};

/**
 * Estimate number of pages from file.
 * For PDFs, attempts to read page count from structure; defaults to 1 for other formats.
 */
const estimatePages = (filename: string, filePath: string): number => {
  const ext = path.extname(filename).toLowerCase();

  if (ext === '.pdf') {
    try {
      const buffer = fs.readFileSync(filePath);
      const content = buffer.toString('latin1');

      const match = content.match(/Type\s*\/Catalog[\s\S]*?\/Count\s+(\d+)/);
      if (match?.[1]) return Math.max(1, parseInt(match[1], 10));

      const pagesMatch = content.match(/\/Pages[\s\S]*?\/Count\s+(\d+)/);
      if (pagesMatch?.[1]) return Math.max(1, parseInt(pagesMatch[1], 10));

      return 1;
    } catch {
      return 1;
    }
  }

  return 1;
};

/**
 * Sidecar metadata path for a given file UUID (no extension)
 */
const metaPath = (uploadsDir: string, fileUuid: string): string =>
  path.join(uploadsDir, `${fileUuid}.meta.json`);

/**
 * Read sidecar metadata for a file, returning defaults if absent
 */
const readMeta = (uploadsDir: string, fileUuid: string, fallbackName: string): FileMeta => {
  const mp = metaPath(uploadsDir, fileUuid);
  try {
    if (fs.existsSync(mp)) {
      return JSON.parse(fs.readFileSync(mp, 'utf-8')) as FileMeta;
    }
  } catch {
    // ignore malformed sidecar
  }
  return { originalName: fallbackName, mimeType: 'application/octet-stream' };
};

/**
 * Write sidecar metadata for a file
 */
const writeMeta = (uploadsDir: string, fileUuid: string, meta: FileMeta): void => {
  fs.writeFileSync(metaPath(uploadsDir, fileUuid), JSON.stringify(meta), 'utf-8');
};

/**
 * Create document metadata from file.
 * The stable ID is derived from the filename UUID (strip extension).
 */
const createDocumentMetadata = (
  filename: string,
  filePath: string,
  mimeType: string,
  originalName?: string
): StorageDocument => {
  const stats = fs.statSync(filePath);
  const fileUuid = path.basename(filename, path.extname(filename));

  return {
    id: fileUuid,
    name: filename,
    originalName: originalName || filename,
    format: getFileFormat(filename),
    pages: estimatePages(filename, filePath),
    size: getFileSize(stats.size),
    date: new Date(stats.mtime).toISOString().split('T')[0],
    filePath: filePath,
    mimeType: mimeType,
  };
};

/**
 * Save uploaded file to storage
 */
export const saveFile = (
  fileBuffer: Buffer,
  originalFileName: string,
  mimeType: string
): Promise<StorageResult> => {
  return new Promise((resolve) => {
    try {
      const uploadsDir = getUploadsDir();
      const fileUuid = randomUUID();
      const ext = path.extname(originalFileName);
      const filename = `${fileUuid}${ext}`;
      const filePath = path.join(uploadsDir, filename);

      logger.info('Saving file to storage', {
        fileUuid,
        originalFileName,
        size: fileBuffer.length,
        mimeType,
        filename,
      });

      fs.writeFileSync(filePath, fileBuffer);

      // Persist sidecar so originalName and mimeType survive relisting
      writeMeta(uploadsDir, fileUuid, { originalName: originalFileName, mimeType });

      const document = createDocumentMetadata(filename, filePath, mimeType, originalFileName);

      logger.info('File saved successfully', {
        fileUuid,
        path: filePath,
        filename,
        pages: document.pages,
      });

      resolve({ success: true, data: document });
    } catch (error) {
      const err = error as Error;
      logger.error('Error saving file', { error: err.message });
      resolve({ success: false, error: err.message });
    }
  });
};

/**
 * Get all stored documents (skips .meta.json sidecars)
 */
export const getAllDocuments = (): Promise<StorageResult> => {
  return new Promise((resolve) => {
    try {
      const uploadsDir = getUploadsDir();
      const files = fs.readdirSync(uploadsDir);

      const documents: StorageDocument[] = [];

      for (const filename of files) {
        // Skip sidecar metadata files
        if (filename.endsWith('.meta.json')) continue;

        try {
          const filePath = path.join(uploadsDir, filename);
          const stats = fs.statSync(filePath);

          if (!stats.isFile()) continue;

          const fileUuid = path.basename(filename, path.extname(filename));
          const meta = readMeta(uploadsDir, fileUuid, filename);

          documents.push({
            id: fileUuid,
            name: filename,
            originalName: meta.originalName,
            format: getFileFormat(filename),
            pages: estimatePages(filename, filePath),
            size: getFileSize(stats.size),
            date: new Date(stats.mtime).toISOString().split('T')[0],
            filePath: filePath,
            mimeType: meta.mimeType,
          });
        } catch (error) {
          logger.warn('Error reading file', { filename, error: String(error) });
        }
      }

      // Sort by date descending
      documents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      logger.info('Retrieved all documents', { count: documents.length });

      resolve({ success: true, data: documents });
    } catch (error) {
      const err = error as Error;
      logger.error('Error retrieving documents', { error: err.message });
      resolve({ success: false, error: err.message });
    }
  });
};

/**
 * Get document by filename
 */
export const getDocument = (filename: string): Promise<StorageResult> => {
  return new Promise((resolve) => {
    try {
      const uploadsDir = getUploadsDir();
      const filePath = path.join(uploadsDir, filename);

      if (!isSafePath(filePath, uploadsDir)) {
        logger.warn('Attempted directory traversal', { filename });
        resolve({ success: false, error: 'Invalid file path' });
        return;
      }

      if (!fs.existsSync(filePath)) {
        logger.warn('File not found', { filename });
        resolve({ success: false, error: 'File not found' });
        return;
      }

      const fileUuid = path.basename(filename, path.extname(filename));
      const meta = readMeta(uploadsDir, fileUuid, filename);
      const document = createDocumentMetadata(filename, filePath, meta.mimeType, meta.originalName);

      logger.info('Retrieved document', { filename });

      resolve({ success: true, data: document });
    } catch (error) {
      const err = error as Error;
      logger.error('Error retrieving document', { error: err.message });
      resolve({ success: false, error: err.message });
    }
  });
};

/**
 * Get file buffer for download
 */
export const getFileBuffer = (filename: string): Promise<{ success: boolean; buffer?: Buffer; error?: string }> => {
  return new Promise((resolve) => {
    try {
      const uploadsDir = getUploadsDir();
      const filePath = path.join(uploadsDir, filename);

      if (!isSafePath(filePath, uploadsDir)) {
        logger.warn('Attempted directory traversal on download', { filename });
        resolve({ success: false, error: 'Invalid file path' });
        return;
      }

      if (!fs.existsSync(filePath)) {
        logger.warn('File not found for download', { filename });
        resolve({ success: false, error: 'File not found' });
        return;
      }

      const buffer = fs.readFileSync(filePath);

      logger.info('Retrieved file buffer', { filename, size: buffer.length });

      resolve({ success: true, buffer });
    } catch (error) {
      const err = error as Error;
      logger.error('Error retrieving file buffer', { error: err.message });
      resolve({ success: false, error: err.message });
    }
  });
};

/**
 * Delete document from storage (also removes sidecar)
 */
export const deleteDocument = (filename: string): Promise<StorageResult> => {
  return new Promise((resolve) => {
    try {
      const uploadsDir = getUploadsDir();
      const filePath = path.join(uploadsDir, filename);

      if (!isSafePath(filePath, uploadsDir)) {
        logger.warn('Attempted directory traversal on delete', { filename });
        resolve({ success: false, error: 'Invalid file path' });
        return;
      }

      if (!fs.existsSync(filePath)) {
        logger.warn('File not found for deletion', { filename });
        resolve({ success: false, error: 'File not found' });
        return;
      }

      fs.unlinkSync(filePath);

      // Remove sidecar if present
      const fileUuid = path.basename(filename, path.extname(filename));
      const mp = metaPath(uploadsDir, fileUuid);
      if (fs.existsSync(mp)) {
        try { fs.unlinkSync(mp); } catch { /* ignore */ }
      }

      logger.info('Document deleted', { filename });

      resolve({ success: true });
    } catch (error) {
      const err = error as Error;
      logger.error('Error deleting document', { error: err.message });
      resolve({ success: false, error: err.message });
    }
  });
};

/**
 * Get storage statistics (excludes sidecar files)
 */
export const getStorageStats = (): Promise<{ success: boolean; stats?: { totalFiles: number; totalSize: string }; error?: string }> => {
  return new Promise((resolve) => {
    try {
      const uploadsDir = getUploadsDir();
      const files = fs.readdirSync(uploadsDir);

      let totalSize = 0;
      let totalFiles = 0;

      for (const filename of files) {
        if (filename.endsWith('.meta.json')) continue;
        try {
          const filePath = path.join(uploadsDir, filename);
          const stats = fs.statSync(filePath);
          if (stats.isFile()) {
            totalSize += stats.size;
            totalFiles += 1;
          }
        } catch {
          logger.warn('Error reading file stats', { filename });
        }
      }

      logger.info('Retrieved storage stats', { totalFiles, totalSize });

      resolve({ success: true, stats: { totalFiles, totalSize: getFileSize(totalSize) } });
    } catch (error) {
      const err = error as Error;
      logger.error('Error retrieving storage stats', { error: err.message });
      resolve({ success: false, error: err.message });
    }
  });
};
