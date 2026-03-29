import { logger } from '../utils/logger';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { config } from '../utils/config';
import PDFDocument from 'pdfkit';

interface PrintOptions {
  type?: string;
  printerName?: string;
  paperSize?: string; // 'A4' | 'Folio' | 'Letter' | 'Legal'
}

interface PrintResult {
  success: boolean;
  jobID?: string;
  error?: string;
  method?: string;
  simulatedPaths?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Paper size helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalise paper size string to a value PDFKit accepts (uppercase).
 * PDFKit supports: A4, FOLIO, LETTER, LEGAL, TABLOID, EXECUTIVE, etc.
 */
const toPdfKitSize = (size?: string): string => {
  if (!size) return 'A4';
  const s = size.toUpperCase();
  // PDFKit uses 'FOLIO', SumatraPDF uses 'folio' — unify here to uppercase
  const map: Record<string, string> = {
    FOLIO: 'FOLIO',
    A4: 'A4',
    LETTER: 'LETTER',
    LEGAL: 'LEGAL',
    TABLOID: 'TABLOID',
  };
  return map[s] ?? 'A4';
};

/**
 * Normalise paper size for pdf-to-printer / SumatraPDF (lowercase preferred).
 */
const toSumatraSize = (size?: string): string | undefined => {
  if (!size) return undefined;
  return size.toLowerCase();
};

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
 * Write text content to PrintSimulation folder as a .txt file.
 */
const writeTextToSimulation = (text: string, filename: string): string | null => {
  if (!config.print.simulationEnabled) return null;
  try {
    if (!fs.existsSync(printSimDir)) {
      fs.mkdirSync(printSimDir, { recursive: true });
    }
    const dest = path.join(printSimDir, `${Date.now()}_${filename}`);
    fs.writeFileSync(dest, text, 'utf-8');
    logger.info('Simulation text file saved', { dest });
    return dest;
  } catch (err) {
    logger.warn('Failed to write simulation text', { error: String(err) });
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
// Text → PDF conversion (PDFKit)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render plain text to a PDF file using PDFKit.
 * Uses Courier (monospace) so receipt columns align correctly.
 * Returns the path of the created PDF file.
 */
const renderTextToPdf = (
  text: string,
  outputPath: string,
  paperSize: string
): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: toPdfKitSize(paperSize),
        margin: 40,
        autoFirstPage: true,
      });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      doc
        .font('Courier')
        .fontSize(9)
        .text(text, { lineGap: 1, paragraphGap: 0 });

      doc.end();

      stream.on('finish', resolve);
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Core PDF printing via pdf-to-printer (Windows) or lp (Linux/macOS)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Print a PDF file using the best available method for the current platform.
 *
 * Windows strategy (in order):
 *   1. pdf-to-printer (bundles SumatraPDF — best, supports printer + paper size)
 *   2. PowerShell Start-Process -Verb Print (system default printer, no size control)
 *   3. print.exe (legacy fallback)
 */
const printPdfFile = async (
  filePath: string,
  jobID: string,
  paperSize?: string
): Promise<{ success: boolean; method: string; error?: string }> => {
  const platform = os.platform();

  if (platform === 'win32') {
    // ── Method 1: pdf-to-printer (SumatraPDF) ───────────────────────────────
    try {
      const pdfToPrinter = await import('pdf-to-printer');
      const printOptions: {
        printer?: string;
        silent?: boolean;
        paperSize?: string;
      } = { silent: true };
      if (config.print.printerName) printOptions.printer = config.print.printerName;
      const sumatraSize = toSumatraSize(paperSize);
      if (sumatraSize) printOptions.paperSize = sumatraSize;
      await pdfToPrinter.default.print(filePath, printOptions);
      logger.info('PDF printed via pdf-to-printer', { jobID, paperSize: sumatraSize });
      return { success: true, method: 'pdf-to-printer' };
    } catch (err) {
      logger.warn('pdf-to-printer failed, falling back to Start-Process', {
        jobID,
        error: String(err).substring(0, 200),
      });
    }

    // ── Method 2: PowerShell Start-Process -Verb Print ───────────────────────
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

    // ── Method 3: print.exe (legacy) ─────────────────────────────────────────
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

    return {
      success: false,
      method: 'windows-all-failed',
      error: 'All Windows PDF print methods failed',
    };
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
      return { success: true, method: 'lpr' };
    } catch (lprErr) {
      return { success: false, method: 'lp-failed', error: String(lprErr) };
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Text printing — convert to PDF first, then print
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Print plain text content by first rendering it to a PDF (via PDFKit),
 * then sending the PDF to the printer (via pdf-to-printer / SumatraPDF).
 *
 * This approach eliminates all Windows encoding / codepage issues because
 * the text is rendered as vectors inside the PDF rather than sent as raw
 * bytes to the printer driver.
 */
export const printText = async (
  text: string,
  options?: Partial<PrintOptions>
): Promise<PrintResult> => {
  const jobID = `JOB-${Date.now()}`;
  const paperSize = options?.paperSize ?? 'A4';
  logger.info('Print text request', { jobID, contentLength: text.length, paperSize });

  const tempPdf = path.join(os.tmpdir(), `print_${jobID}.pdf`);

  try {
    // 1. Render text → PDF
    await renderTextToPdf(text, tempPdf, paperSize);
    logger.info('Text rendered to PDF', { jobID, tempPdf });

    // 2. Print the PDF
    const result = await printPdfFile(tempPdf, jobID, paperSize);
    if (result.success) {
      // Save simulation copy of the original text too
      if (config.print.simulationEnabled) {
        writeTextToSimulation(text, `receipt_${jobID}.txt`);
        copyToSimulation(tempPdf, `receipt_${jobID}.pdf`);
      }
      return { success: true, jobID, method: result.method };
    }

    // 3. All print methods failed — simulation fallback
    if (config.print.simulationEnabled) {
      const simPath = copyToSimulation(tempPdf, `receipt_${jobID}.pdf`);
      writeTextToSimulation(text, `receipt_${jobID}.txt`);
      if (simPath) {
        logger.info('Text print simulated', { jobID, simPath });
        return { success: true, jobID, method: 'simulation', simulatedPaths: [simPath] };
      }
    }

    return { success: false, jobID, error: result.error ?? 'Print failed' };
  } catch (error) {
    const err = error as Error;
    logger.error('printText error', { jobID, error: err.message });

    // Simulation fallback even on unexpected error
    if (config.print.simulationEnabled) {
      const simPath = writeTextToSimulation(text, `receipt_${jobID}.txt`);
      if (simPath) {
        return { success: true, jobID, method: 'simulation', simulatedPaths: [simPath] };
      }
    }

    return { success: false, jobID, error: err.message };
  } finally {
    try { fs.unlinkSync(tempPdf); } catch { /* temp file may not exist */ }
  }
};

/**
 * Print receipt content
 */
export const printReceipt = async (
  receiptContent: string,
  paperSize?: string
): Promise<PrintResult> => {
  logger.info('Printing receipt', { contentLength: receiptContent.length, paperSize });
  return printText(receiptContent, { paperSize: paperSize ?? 'A4' });
};

/**
 * Print document from raw text content
 */
export const printDocument = async (
  documentContent: string,
  documentName?: string,
  paperSize?: string
): Promise<PrintResult> => {
  logger.info('Printing document', { documentName, paperSize });
  return printText(documentContent, { paperSize: paperSize ?? 'A4' });
};

// ─────────────────────────────────────────────────────────────────────────────
// Print files from storage
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Print files located in the Uploads directory.
 * PDFs → pdf-to-printer directly.
 * Other files → rendered to PDF via PDFKit, then printed.
 * When simulation mode is on, files are also copied to PrintSimulation/.
 */
export const printFilesFromStorage = async (
  filenames: string[],
  paperSize?: string
): Promise<PrintResult> => {
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
        const result = await printPdfFile(filePath, jobID, paperSize);
        printSuccess = result.success;
        if (!result.success) {
          logger.error('PDF print failed', { filename, error: result.error });
        }
        const simPath = copyToSimulation(filePath, filename);
        if (simPath) simulatedPaths.push(simPath);
      } else {
        // Non-PDF: read as text, render to PDF, print
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const result = await printText(content, { paperSize });
          printSuccess = result.success;
          if (result.simulatedPaths) simulatedPaths.push(...result.simulatedPaths);
        } catch (readErr) {
          logger.error('Could not read file as text', { filename, error: String(readErr) });
        }
      }

      if (printSuccess || config.print.simulationEnabled) processedCount++;
    } catch (fileErr) {
      logger.error('Error processing file for printing', {
        filename,
        error: String(fileErr),
      });
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
// Test print
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Print a test page to verify the printer is working.
 * Useful for kiosk setup / diagnostics.
 */
export const printTestPage = async (paperSize?: string): Promise<PrintResult> => {
  const now = new Date().toLocaleString();
  const printerName = config.print.printerName || '(system default)';
  const testContent = `
========================================
         DOCUCENTER KIOSK
         PRINTER TEST PAGE
========================================

Date/Time : ${now}
Printer   : ${printerName}
Paper Size: ${paperSize ?? 'A4'}
Status    : OK

----------------------------------------
If you can read this clearly with no
garbled characters, the printer is
configured correctly.

- Receipt printing: READY
- PDF printing: READY
- Paper size: ${paperSize ?? 'A4'}

========================================
        Thank you for using
        DocuCenter Kiosk
========================================
`;

  logger.info('Printing test page', { printerName, paperSize });
  return printText(testContent, { paperSize: paperSize ?? 'A4' });
};

// ─────────────────────────────────────────────────────────────────────────────
// Printer enumeration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get available printers via pdf-to-printer, with platform fallbacks.
 */
export const getAvailablePrinters = async (): Promise<{ name: string; paperSizes: string[] }[]> => {
  // ── pdf-to-printer (Windows primary) ────────────────────────────────────────
  try {
    const pdfToPrinter = await import('pdf-to-printer');
    const printers = await pdfToPrinter.default.getPrinters();
    logger.info('Retrieved printers via pdf-to-printer', { count: printers.length });
    return printers.map((p: { name: string; paperSizes?: string[] }) => ({
      name: p.name,
      paperSizes: p.paperSizes ?? [],
    }));
  } catch (importErr) {
    logger.warn('pdf-to-printer not available for printer list', { error: String(importErr) });
  }

  // ── PowerShell fallback (Windows) ─────────────────────────────────────────
  if (os.platform() === 'win32') {
    try {
      const out = execSync(
        'powershell -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name"',
        { encoding: 'utf-8', timeout: 5000, windowsHide: true }
      );
      const names = out.split('\n').map((s) => s.trim()).filter(Boolean);
      logger.info('Retrieved printers via PowerShell', { count: names.length });
      return names.map((name) => ({ name, paperSizes: [] }));
    } catch (err) {
      logger.warn('PowerShell printer list failed', { error: String(err) });
    }
  }

  // ── lpstat fallback (Linux / macOS) ──────────────────────────────────────
  try {
    const out = execSync('lpstat -a', { encoding: 'utf-8', timeout: 5000 });
    const names = out.split('\n').map((line) => line.split(' ')[0]).filter(Boolean);
    return names.map((name) => ({ name, paperSizes: [] }));
  } catch {
    return [];
  }
};
