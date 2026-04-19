import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { logger } from '../utils/logger';

/**
 * PDF Conversion Service
 * Converts various document formats to PDF for consistent printing
 */

/**
 * Check if LibreOffice is available on the system
 */
const isLibreOfficeAvailable = (): boolean => {
  try {
    execSync('where soffice', { stdio: 'ignore', timeout: 2000 });
    return true;
  } catch {
    try {
      execSync('where libreoffice', { stdio: 'ignore', timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }
};

/**
 * Convert document to PDF using LibreOffice
 * Supports: DOC, DOCX, XLS, XLSX, PPT, PPTX, ODP, ODT, etc.
 */
const convertWithLibreOffice = (inputPath: string, outputDir: string): string => {
  try {
    const cmd = `soffice --headless --convert-to pdf "${inputPath}" --outdir "${outputDir}"`;
    logger.info('Converting with LibreOffice', { cmd });
    execSync(cmd, { timeout: 30000, stdio: 'pipe' });

    const inputFileName = path.parse(inputPath).name;
    const pdfPath = path.join(outputDir, `${inputFileName}.pdf`);

    if (fs.existsSync(pdfPath)) {
      logger.info('Document converted to PDF', { inputPath, pdfPath });
      return pdfPath;
    }
  } catch (error) {
    logger.warn('LibreOffice conversion failed', { error: String(error) });
  }

  throw new Error('Failed to convert document to PDF');
};

/**
 * Copy text file as-is (already printable)
 */
const handleTextFile = (inputPath: string, outputPath: string): string => {
  fs.copyFileSync(inputPath, outputPath);
  logger.info('Text file copied', { inputPath, outputPath });
  return outputPath;
};

/**
 * Handle image files - could be converted to PDF if needed
 * For now, just copy them as-is (printable via system)
 */
const handleImageFile = (inputPath: string, outputPath: string): string => {
  fs.copyFileSync(inputPath, outputPath);
  logger.info('Image file copied', { inputPath, outputPath });
  return outputPath;
};

/**
 * Main conversion function
 * Converts any file to PDF or keeps it as is if already universal format
 */
export const convertToPdf = (
  inputPath: string,
  outputDir: string,
  originalFileName: string,
): string => {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`File not found: ${inputPath}`);
  }

  const ext = path.extname(originalFileName).toLowerCase();
  const fileName = path.parse(originalFileName).name;
  const outputPath = path.join(outputDir, `${fileName}.pdf`);

  try {
    logger.info('Starting file conversion', {
      inputFile: originalFileName,
      ext,
      outputPath,
    });

    // If already PDF, just copy it
    if (ext === '.pdf') {
      fs.copyFileSync(inputPath, outputPath);
      logger.info('PDF file copied', { outputPath });
      return outputPath;
    }

    // Text files - print directly
    if (['.txt', '.csv'].includes(ext)) {
      return handleTextFile(inputPath, outputPath);
    }

    // Image files - keep as-is (Windows can print images)
    if (['.jpg', '.jpeg', '.png', '.bmp', '.gif'].includes(ext)) {
      return handleImageFile(inputPath, outputPath);
    }

    // Document files - convert to PDF if LibreOffice available
    if (['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp'].includes(ext)) {
      if (isLibreOfficeAvailable()) {
        return convertWithLibreOffice(inputPath, outputDir);
      } else {
        // Fallback: copy as-is (Windows may still be able to print some formats)
        logger.warn('LibreOffice not available, copying file as-is', { file: originalFileName });
        fs.copyFileSync(inputPath, outputPath);
        return outputPath;
      }
    }

    // Unknown format - try to copy as-is
    logger.warn('Unknown file format, copying as-is', { ext, originalFileName });
    fs.copyFileSync(inputPath, outputPath);
    return outputPath;
  } catch (error) {
    const err = error as Error;
    logger.error('PDF conversion failed', {
      file: originalFileName,
      error: err.message,
    });

    // Fallback: just copy the file as-is
    try {
      fs.copyFileSync(inputPath, outputPath);
      logger.info('Conversion failed, file copied as-is', { outputPath });
      return outputPath;
    } catch (copyErr) {
      throw new Error(`Failed to process file: ${(copyErr as Error).message}`);
    }
  }
};

export default { convertToPdf, isLibreOfficeAvailable };
