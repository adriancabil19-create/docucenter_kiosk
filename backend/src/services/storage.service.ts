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

// Get the Uploads directory path (relative to project root)
const getUploadsDir = (): string => {
  const uploadsDir = path.join(__dirname, '../../..', 'Uploads');
  
  // Ensure directory exists
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    logger.info('Created Uploads directory', { path: uploadsDir });
  }
  
  return uploadsDir;
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
  return filename.split('.').pop()?.toUpperCase() || 'UNKNOWN';
};

/**
 * Estimate number of pages from file size (rough estimation)
 */
const estimatePages = (filename: string, sizeInBytes: number): number => {
  const format = getFileFormat(filename).toLowerCase();
  
  // For PDFs: roughly 100KB per page
  if (format === 'pdf') {
    return Math.max(1, Math.ceil(sizeInBytes / (100 * 1024)));
  }
  
  // For images: 1 page
  if (['jpg', 'jpeg', 'png', 'bmp', 'gif'].includes(format)) {
    return 1;
  }
  
  // For documents: estimate based on size
  if (['doc', 'docx', 'txt'].includes(format)) {
    return Math.max(1, Math.ceil(sizeInBytes / (50 * 1024)));
  }
  
  return 1;
};

/**
 * Create document metadata from file
 */
const createDocumentMetadata = (filename: string, filePath: string, mimeType: string): StorageDocument => {
  const stats = fs.statSync(filePath);
  
  return {
    id: randomUUID(),
    name: filename,
    originalName: filename,
    format: getFileFormat(filename),
    pages: estimatePages(filename, stats.size),
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
      const fileId = randomUUID();
      const ext = path.extname(originalFileName);
      const filename = `${fileId}${ext}`;
      const filePath = path.join(uploadsDir, filename);
      
      logger.info('Saving file to storage', { 
        fileId, 
        originalFileName, 
        size: fileBuffer.length,
        mimeType 
      });
      
      fs.writeFileSync(filePath, fileBuffer);
      
      const document = createDocumentMetadata(originalFileName, filePath, mimeType);
      
      logger.info('File saved successfully', { fileId, path: filePath });
      
      resolve({
        success: true,
        data: document,
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Error saving file', { error: err.message });
      resolve({
        success: false,
        error: err.message,
      });
    }
  });
};

/**
 * Get all stored documents
 */
export const getAllDocuments = (): Promise<StorageResult> => {
  return new Promise((resolve) => {
    try {
      const uploadsDir = getUploadsDir();
      const files = fs.readdirSync(uploadsDir);
      
      const documents: StorageDocument[] = [];
      
      files.forEach((filename) => {
        try {
          const filePath = path.join(uploadsDir, filename);
          const stats = fs.statSync(filePath);
          
          // Skip if it's a directory
          if (!stats.isFile()) return;
          
          documents.push({
            id: randomUUID(),
            name: filename,
            originalName: filename,
            format: getFileFormat(filename),
            pages: estimatePages(filename, stats.size),
            size: getFileSize(stats.size),
            date: new Date(stats.mtime).toISOString().split('T')[0],
            filePath: filePath,
            mimeType: 'application/octet-stream',
          });
        } catch (error) {
          logger.warn('Error reading file', { filename, error: String(error) });
        }
      });
      
      // Sort by date descending
      documents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      logger.info('Retrieved all documents', { count: documents.length });
      
      resolve({
        success: true,
        data: documents,
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Error retrieving documents', { error: err.message });
      resolve({
        success: false,
        error: err.message,
      });
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
      
      // Prevent directory traversal attacks
      if (!filePath.startsWith(uploadsDir)) {
        logger.warn('Attempted directory traversal', { filename });
        resolve({
          success: false,
          error: 'Invalid file path',
        });
        return;
      }
      
      if (!fs.existsSync(filePath)) {
        logger.warn('File not found', { filename });
        resolve({
          success: false,
          error: 'File not found',
        });
        return;
      }
      
      const document = createDocumentMetadata(filename, filePath, 'application/octet-stream');
      
      logger.info('Retrieved document', { filename });
      
      resolve({
        success: true,
        data: document,
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Error retrieving document', { error: err.message });
      resolve({
        success: false,
        error: err.message,
      });
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
      
      // Prevent directory traversal attacks
      if (!filePath.startsWith(uploadsDir)) {
        logger.warn('Attempted directory traversal on download', { filename });
        resolve({
          success: false,
          error: 'Invalid file path',
        });
        return;
      }
      
      if (!fs.existsSync(filePath)) {
        logger.warn('File not found for download', { filename });
        resolve({
          success: false,
          error: 'File not found',
        });
        return;
      }
      
      const buffer = fs.readFileSync(filePath);
      
      logger.info('Retrieved file buffer', { filename, size: buffer.length });
      
      resolve({
        success: true,
        buffer: buffer,
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Error retrieving file buffer', { error: err.message });
      resolve({
        success: false,
        error: err.message,
      });
    }
  });
};

/**
 * Delete document from storage
 */
export const deleteDocument = (filename: string): Promise<StorageResult> => {
  return new Promise((resolve) => {
    try {
      const uploadsDir = getUploadsDir();
      const filePath = path.join(uploadsDir, filename);
      
      // Prevent directory traversal attacks
      if (!filePath.startsWith(uploadsDir)) {
        logger.warn('Attempted directory traversal on delete', { filename });
        resolve({
          success: false,
          error: 'Invalid file path',
        });
        return;
      }
      
      if (!fs.existsSync(filePath)) {
        logger.warn('File not found for deletion', { filename });
        resolve({
          success: false,
          error: 'File not found',
        });
        return;
      }
      
      fs.unlinkSync(filePath);
      
      logger.info('Document deleted', { filename });
      
      resolve({
        success: true,
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Error deleting document', { error: err.message });
      resolve({
        success: false,
        error: err.message,
      });
    }
  });
};

/**
 * Get storage statistics
 */
export const getStorageStats = (): Promise<{ success: boolean; stats?: { totalFiles: number; totalSize: string }; error?: string }> => {
  return new Promise((resolve) => {
    try {
      const uploadsDir = getUploadsDir();
      const files = fs.readdirSync(uploadsDir);
      
      let totalSize = 0;
      let totalFiles = 0;
      
      files.forEach((filename) => {
        try {
          const filePath = path.join(uploadsDir, filename);
          const stats = fs.statSync(filePath);
          
          if (stats.isFile()) {
            totalSize += stats.size;
            totalFiles += 1;
          }
        } catch (error) {
          logger.warn('Error reading file stats', { filename });
        }
      });
      
      logger.info('Retrieved storage stats', { totalFiles, totalSize });
      
      resolve({
        success: true,
        stats: {
          totalFiles,
          totalSize: getFileSize(totalSize),
        },
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Error retrieving storage stats', { error: err.message });
      resolve({
        success: false,
        error: err.message,
      });
    }
  });
};
