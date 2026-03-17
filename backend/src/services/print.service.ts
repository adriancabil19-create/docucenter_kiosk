import { logger } from '../utils/logger';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { config } from '../utils/config';

interface PrintOptions {
  data: string;
  type?: string;
  printerName?: string;
}

interface PrintResult {
  success: boolean;
  jobID?: string;
  error?: string;
  method?: string;
  simulatedPaths?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Root of the project (two levels above /backend/src/services) */
const projectRoot = path.resolve(__dirname, '../../..');

/** Uploads directory */
const uploadsDir = path.resolve(projectRoot, 'Uploads');

/** PrintSimulation directory */
const printSimDir = path.resolve(projectRoot, 'PrintSimulation');

/**
 * Copy file to PrintSimulation folder (when simulation mode is on) and
 * return the destination path.
 */
const copyToSimulation = (srcPath: string, filename: string): string | null => {
  if (!config.print.simulationEnabled) return null;
  try {
    if (!fs.existsSync(printSimDir)) {
      fs.mkdirSync(printSimDir, { recursive: true });
    }
    const dest = path.join(printSimDir, `${Date.now()}_${filename}`);
    fs.copyFileSync(srcPath, dest);
    logger.info('Simulation copy saved', { dest });
    return dest;
  } catch (err) {
    logger.warn('Failed to copy to PrintSimulation', { error: String(err) });
    return null;
  }
};

/**
 * Safe path check — prevents directory traversal
 */
const isSafePath = (filePath: string, baseDir: string): boolean => {
  const resolved = path.resolve(filePath);
  const base = path.resolve(baseDir);
  return resolved.startsWith(base + path.sep);
};

// ─────────────────────────────────────────────────────────────────────────────
// PDF printing via pdf-to-printer (Windows) or lp (Linux/macOS)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Print a PDF file using the best available method for the current platform.
 */
const printPdfFile = async (
  filePath: string,
  jobID: string
): Promise<{ success: boolean; method: string; error?: string }> => {
  const platform = os.platform();

  if (platform === 'win32') {
    try {
      // pdf-to-printer bundles SumatraPDF and handles Windows print queues correctly
      const pdfToPrinter = await import('pdf-to-printer');
      const printOptions = config.print.printerName
        ? { printer: config.print.printerName }
        : undefined;
      await pdfToPrinter.default.print(filePath, printOptions);
      logger.info('PDF printed via pdf-to-printer', { jobID, filePath });
      return { success: true, method: 'pdf-to-printer' };
    } catch (err) {
      logger.warn('pdf-to-printer failed, falling back to Start-Process', {
        jobID,
        error: String(err).substring(0, 120),
      });
    }

    // Fallback: PowerShell Start-Process with Print verb
    try {
      const escaped = filePath.replace(/'/g, "''");
      const printerArg = config.print.printerName
        ? `-DefaultPrinter "${config.print.printerName.replace(/"/g, '\\"')}"`
        : '';
      execSync(
        `powershell -NoProfile -Command "Start-Process -FilePath '${escaped}' -Verb Print ${printerArg} -Wait"`,
        { stdio: 'pipe', timeout: 15000, windowsHide: true }
      );
      logger.info('PDF printed via Start-Process', { jobID });
      return { success: true, method: 'start-process' };
    } catch (err) {
      logger.warn('Start-Process failed', { jobID, error: String(err).substring(0, 120) });
    }

    // Last resort: print.exe
    try {
      const target = config.print.printerName
        ? `/D:"${config.print.printerName}"`
        : '';
      execSync(`print ${target} "${filePath}"`, {
        stdio: 'pipe',
        timeout: 15000,
        windowsHide: true,
      } as object);
      logger.info('PDF printed via print.exe', { jobID });
      return { success: true, method: 'print-exe' };
    } catch (err) {
      logger.warn('print.exe failed', { jobID, error: String(err).substring(0, 120) });
    }

    return { success: false, method: 'windows-all-failed', error: 'All Windows PDF print methods failed' };
  }

  // Linux / macOS — use lp
  try {
    const printerArg = config.print.printerName ? `-d "${config.print.printerName}"` : '';
    execSync(`lp ${printerArg} "${filePath}"`, { stdio: 'pipe', timeout: 10000 });
    logger.info('PDF printed via lp', { jobID, platform });
    return { success: true, method: 'lp' };
  } catch (err) {
    logger.warn('lp failed, trying lpr', { jobID, error: String(err).substring(0, 120) });
    try {
      execSync(`lpr "${filePath}"`, { stdio: 'pipe', timeout: 10000 });
      logger.info('PDF printed via lpr', { jobID });
      return { success: true, method: 'lpr' };
    } catch (lprErr) {
      return { success: false, method: 'lp-failed', error: String(lprErr) };
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Text printing (for raw text / receipts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Print text content using the system printer
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const printText = async (text: string, options?: Partial<PrintOptions>): Promise<PrintResult> => {
  const jobID = `JOB-${Date.now()}`;
  logger.info('Print text request', { jobID, contentLength: text.length });

  const platform = os.platform();
  const tempFile = path.join(os.tmpdir(), `print_${jobID}.txt`);

  try {
    fs.writeFileSync(tempFile, text, 'utf-8');

    if (platform === 'win32') {
      // PowerShell Out-Printer (works for text)
      try {
        const printerArg = config.print.printerName
          ? `-Name "${config.print.printerName.replace(/"/g, '\\"')}"`
          : '';
        execSync(
          `powershell -NoProfile -Command "Get-Content -Path '${tempFile.replace(/'/g, "''")}' | Out-Printer ${printerArg}"`,
          { stdio: 'pipe', timeout: 10000, windowsHide: true }
        );
        logger.info('Text printed via Out-Printer', { jobID });
        return { success: true, jobID, method: 'out-printer' };
      } catch (err) {
        logger.warn('Out-Printer failed', { jobID, error: String(err).substring(0, 120) });
      }

      // Notepad silent print fallback
      try {
        execSync(`notepad /p "${tempFile}"`, { stdio: 'pipe', timeout: 8000, windowsHide: true });
        logger.info('Text printed via notepad', { jobID });
        return { success: true, jobID, method: 'notepad' };
      } catch (err) {
        logger.warn('Notepad print failed', { jobID, error: String(err).substring(0, 120) });
      }

      return { success: false, jobID, error: 'All Windows text print methods failed' };
    }

    // Linux / macOS
    try {
      execSync(`lp "${tempFile}"`, { stdio: 'pipe', timeout: 10000 });
      return { success: true, jobID, method: 'lp' };
    } catch {
      execSync(`lpr "${tempFile}"`, { stdio: 'pipe', timeout: 10000 });
      return { success: true, jobID, method: 'lpr' };
    }
  } catch (error) {
    const err = error as Error;
    logger.error('printText error', { jobID, error: err.message });
    return { success: false, jobID, error: err.message };
  } finally {
    try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
  }
};

/**
 * Print receipt content
 */
export const printReceipt = async (receiptContent: string): Promise<PrintResult> => {
  logger.info('Printing receipt', { contentLength: receiptContent.length });
  return printText(receiptContent, { type: 'RAW' });
};

/**
 * Print document from content
 */
export const printDocument = async (
  documentContent: string,
  documentName?: string
): Promise<PrintResult> => {
  logger.info('Printing document', { documentName });
  return printText(documentContent, { type: 'RAW' });
};

// ─────────────────────────────────────────────────────────────────────────────
// Print files from storage
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Print files located in the Uploads directory.
 * PDFs are handled by pdf-to-printer (Windows) or lp (Linux/macOS).
 * When simulation mode is on, files are also copied to PrintSimulation/.
 */
export const printFilesFromStorage = async (filenames: string[]): Promise<PrintResult> => {
  if (!fs.existsSync(uploadsDir)) {
    logger.warn('Uploads directory does not exist', { uploadsDir });
    return { success: false, error: 'Uploads directory not found' };
  }

  let processedCount = 0;
  const simulatedPaths: string[] = [];
  const jobID = `JOB-${Date.now()}`;

  for (const filename of filenames) {
    const filePath = path.join(uploadsDir, filename);

    if (!isSafePath(filePath, uploadsDir)) {
      logger.warn('Attempted directory traversal', { filename });
      continue;
    }

    if (!fs.existsSync(filePath)) {
      logger.warn('File not found in storage', { filename });
      continue;
    }

    try {
      const ext = path.extname(filename).toLowerCase();
      let printSuccess = false;

      if (ext === '.pdf') {
        const result = await printPdfFile(filePath, jobID);
        printSuccess = result.success;
        if (!result.success) {
          logger.error('PDF print failed', { filename, error: result.error });
        }
      } else {
        // For non-PDF files, read as text and use printText
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const result = await printText(content);
          printSuccess = result.success;
        } catch (readErr) {
          logger.error('Could not read file as text', { filename, error: String(readErr) });
        }
      }

      // Simulation copy (regardless of print outcome — useful for demo)
      const simPath = copyToSimulation(filePath, filename);
      if (simPath) simulatedPaths.push(simPath);

      if (printSuccess) processedCount++;
    } catch (fileErr) {
      logger.error('Error processing file for printing', { filename, error: String(fileErr) });
    }
  }

  if (processedCount === 0 && !config.print.simulationEnabled) {
    return {
      success: false,
      error: 'No files were successfully sent to the printer',
      jobID,
      simulatedPaths: simulatedPaths.length > 0 ? simulatedPaths : undefined,
    };
  }

  logger.info('Batch print job completed', {
    totalFiles: filenames.length,
    processedCount,
    simulatedCount: simulatedPaths.length,
  });

  return {
    success: true,
    jobID,
    method: 'kiosk-storage-print',
    simulatedPaths: simulatedPaths.length > 0 ? simulatedPaths : undefined,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Printer enumeration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get available printers via pdf-to-printer, with platform fallbacks
 */
export const getAvailablePrinters = async (): Promise<string[]> => {
  try {
    const pdfToPrinter = await import('pdf-to-printer');
    const printers = await pdfToPrinter.default.getPrinters();
    const names = printers.map((p: { name: string }) => p.name).filter(Boolean);
    logger.info('Retrieved printers via pdf-to-printer', { count: names.length });
    return names;
  } catch (importErr) {
    logger.warn('pdf-to-printer not available for printer list', { error: String(importErr) });
  }

  // Fallback: PowerShell on Windows
  if (os.platform() === 'win32') {
    try {
      const out = execSync(
        'powershell -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name"',
        { encoding: 'utf-8', timeout: 5000, windowsHide: true }
      );
      const names = out.split('\n').map((s) => s.trim()).filter(Boolean);
      logger.info('Retrieved printers via PowerShell', { count: names.length });
      return names;
    } catch (err) {
      logger.warn('PowerShell printer list failed', { error: String(err) });
    }
  }

  // Fallback: lpstat on Linux/macOS
  try {
    const out = execSync('lpstat -a', { encoding: 'utf-8', timeout: 5000 });
    const names = out.split('\n')
      .map((line) => line.split(' ')[0])
      .filter(Boolean);
    logger.info('Retrieved printers via lpstat', { count: names.length });
    return names;
  } catch {
    return [];
  }
};
