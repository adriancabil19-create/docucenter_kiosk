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
 * Ensure PrintSimulation directory exists and copy/write a file into it.
 * Returns the destination path, or null on failure.
 */
const writeToSimulation = (content: string | Buffer, filename: string): string | null => {
  if (!config.print.simulationEnabled) return null;
  try {
    if (!fs.existsSync(printSimDir)) {
      fs.mkdirSync(printSimDir, { recursive: true });
    }
    const dest = path.join(printSimDir, `${Date.now()}_${filename}`);
    if (typeof content === 'string') {
      fs.writeFileSync(dest, content, 'utf-8');
    } else {
      fs.writeFileSync(dest, content);
    }
    logger.info('Simulation file saved', { dest });
    return dest;
  } catch (err) {
    logger.warn('Failed to write to PrintSimulation', { error: String(err) });
    return null;
  }
};

/**
 * Copy an existing file to PrintSimulation folder.
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
 *
 * Windows strategy (in order):
 *   1. pdf-to-printer (bundles SumatraPDF — best option, supports printer selection)
 *   2. PowerShell Start-Process -Verb Print (uses system default printer)
 *   3. print.exe (legacy fallback)
 *
 * Note: Start-Process does NOT support printer selection via a flag. If a
 * specific printer is needed and pdf-to-printer fails, use the environment
 * variable PRINTER_NAME to configure it for pdf-to-printer instead.
 */
const printPdfFile = async (
  filePath: string,
  jobID: string
): Promise<{ success: boolean; method: string; error?: string }> => {
  const platform = os.platform();

  if (platform === 'win32') {
    // ── Method 1: pdf-to-printer (uses SumatraPDF, best for Windows) ──────────
    try {
      const pdfToPrinter = await import('pdf-to-printer');
      const printOptions: { printer?: string; silent?: boolean } = { silent: true };
      if (config.print.printerName) printOptions.printer = config.print.printerName;
      await pdfToPrinter.default.print(filePath, printOptions);
      logger.info('PDF printed via pdf-to-printer', { jobID, filePath });
      return { success: true, method: 'pdf-to-printer' };
    } catch (err) {
      logger.warn('pdf-to-printer failed, falling back to Start-Process', {
        jobID,
        error: String(err).substring(0, 200),
      });
    }

    // ── Method 2: PowerShell Start-Process -Verb Print ────────────────────────
    // Note: -Verb Print uses the file's default handler (e.g. Adobe Reader,
    // Edge, or SumatraPDF) and always sends to the system default printer.
    // There is no -DefaultPrinter flag for Start-Process; set PRINTER_NAME
    // in .env and use pdf-to-printer instead for printer selection.
    try {
      const escaped = filePath.replace(/'/g, "''");
      execSync(
        `powershell -NoProfile -Command "Start-Process -FilePath '${escaped}' -Verb Print -Wait"`,
        { stdio: 'pipe', timeout: 20000, windowsHide: true }
      );
      logger.info('PDF printed via Start-Process', { jobID });
      return { success: true, method: 'start-process' };
    } catch (err) {
      logger.warn('Start-Process failed', { jobID, error: String(err).substring(0, 200) });
    }

    // ── Method 3: print.exe (legacy, works for some file types) ──────────────
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
      logger.warn('print.exe failed', { jobID, error: String(err).substring(0, 200) });
    }

    return { success: false, method: 'windows-all-failed', error: 'All Windows PDF print methods failed' };
  }

  // ── Linux / macOS — use lp ─────────────────────────────────────────────────
  try {
    const printerArg = config.print.printerName ? `-d "${config.print.printerName}"` : '';
    execSync(`lp ${printerArg} "${filePath}"`, { stdio: 'pipe', timeout: 10000 });
    logger.info('PDF printed via lp', { jobID, platform });
    return { success: true, method: 'lp' };
  } catch (err) {
    logger.warn('lp failed, trying lpr', { jobID, error: String(err).substring(0, 200) });
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
 * Print text content using the system printer.
 *
 * Windows strategy (in order):
 *   1. PowerShell Out-Printer — sends text directly to the print queue
 *   2. Start-Process notepad -Verb Print — silent print via Notepad
 *   3. Simulation fallback — writes to PrintSimulation/ when simulation is on
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const printText = async (text: string, _options?: Partial<PrintOptions>): Promise<PrintResult> => {
  const jobID = `JOB-${Date.now()}`;
  logger.info('Print text request', { jobID, contentLength: text.length });

  const platform = os.platform();
  const tempFile = path.join(os.tmpdir(), `print_${jobID}.txt`);

  try {
    fs.writeFileSync(tempFile, text, 'utf-8');

    if (platform === 'win32') {
      // ── Method 1: PowerShell Out-Printer ────────────────────────────────────
      try {
        const printerArg = config.print.printerName
          ? `-Name "${config.print.printerName.replace(/"/g, '\\"')}"`
          : '';
        execSync(
          `powershell -NoProfile -Command "Get-Content -Path '${tempFile.replace(/'/g, "''")}' | Out-Printer ${printerArg}"`,
          { stdio: 'pipe', timeout: 15000, windowsHide: true }
        );
        logger.info('Text printed via Out-Printer', { jobID });
        return { success: true, jobID, method: 'out-printer' };
      } catch (err) {
        logger.warn('Out-Printer failed', { jobID, error: String(err).substring(0, 200) });
      }

      // ── Method 2: Notepad silent print ──────────────────────────────────────
      // Using Start-Process with -ArgumentList is more reliable than `notepad /p`
      // on Windows 10/11 because it does not require the legacy notepad binary.
      try {
        const escapedTemp = tempFile.replace(/'/g, "''");
        execSync(
          `powershell -NoProfile -Command "Start-Process notepad.exe -ArgumentList '/p','${escapedTemp}' -Wait -WindowStyle Hidden"`,
          { stdio: 'pipe', timeout: 15000, windowsHide: true }
        );
        logger.info('Text printed via notepad', { jobID });
        return { success: true, jobID, method: 'notepad' };
      } catch (err) {
        logger.warn('Notepad print failed', { jobID, error: String(err).substring(0, 200) });
      }

      // ── Simulation fallback (Windows) ────────────────────────────────────────
      if (config.print.simulationEnabled) {
        const simPath = writeToSimulation(text, `receipt_${jobID}.txt`);
        if (simPath) {
          logger.info('Text print simulated', { jobID, simPath });
          return { success: true, jobID, method: 'simulation', simulatedPaths: [simPath] };
        }
      }

      return { success: false, jobID, error: 'All Windows text print methods failed' };
    }

    // ── Linux / macOS ──────────────────────────────────────────────────────────
    try {
      const printerArg = config.print.printerName ? `-d "${config.print.printerName}"` : '';
      execSync(`lp ${printerArg} "${tempFile}"`, { stdio: 'pipe', timeout: 10000 });
      return { success: true, jobID, method: 'lp' };
    } catch {
      try {
        execSync(`lpr "${tempFile}"`, { stdio: 'pipe', timeout: 10000 });
        return { success: true, jobID, method: 'lpr' };
      } catch (lprErr) {
        if (config.print.simulationEnabled) {
          const simPath = writeToSimulation(text, `receipt_${jobID}.txt`);
          if (simPath) return { success: true, jobID, method: 'simulation', simulatedPaths: [simPath] };
        }
        return { success: false, jobID, error: String(lprErr) };
      }
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
          // Collect any simulation paths from text print
          if (result.simulatedPaths) simulatedPaths.push(...result.simulatedPaths);
        } catch (readErr) {
          logger.error('Could not read file as text', { filename, error: String(readErr) });
        }
      }

      // Simulation copy for PDF files (non-PDF gets handled above via printText)
      if (ext === '.pdf') {
        const simPath = copyToSimulation(filePath, filename);
        if (simPath) simulatedPaths.push(simPath);
      }

      if (printSuccess || config.print.simulationEnabled) processedCount++;
    } catch (fileErr) {
      logger.error('Error processing file for printing', { filename, error: String(fileErr) });
    }
  }

  if (processedCount === 0) {
    return {
      success: false,
      error: 'No files were successfully processed for printing',
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
 * Get available printers via pdf-to-printer, with platform fallbacks.
 *
 * On Windows, pdf-to-printer calls SumatraPDF to enumerate printers.
 * Falls back to PowerShell Get-Printer if the module is unavailable.
 */
export const getAvailablePrinters = async (): Promise<string[]> => {
  // ── pdf-to-printer (Windows primary) ────────────────────────────────────────
  try {
    const pdfToPrinter = await import('pdf-to-printer');
    const printers = await pdfToPrinter.default.getPrinters();
    const names = printers.map((p: { name: string }) => p.name).filter(Boolean);
    logger.info('Retrieved printers via pdf-to-printer', { count: names.length });
    return names;
  } catch (importErr) {
    logger.warn('pdf-to-printer not available for printer list', { error: String(importErr) });
  }

  // ── PowerShell fallback (Windows) ──────────────────────────────────────────
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

  // ── lpstat fallback (Linux / macOS) ────────────────────────────────────────
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
