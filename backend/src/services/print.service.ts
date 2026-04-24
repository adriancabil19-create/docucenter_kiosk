import { logger } from '../utils/logger';
import { execSync, execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { config } from '../utils/config';
import PDFDocument from 'pdfkit';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';

interface PrintOptions {
  type?: string;
  printerName?: string;
  paperSize?: string; // 'A4' | 'Folio' | 'Letter'
  colorMode?: string; // 'bw' | 'color'
  quality?: string; // 'draft' | 'standard' | 'high'
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
 * PDFKit supports: A4, FOLIO, LETTER, TABLOID, EXECUTIVE, etc.
 */
const toPdfKitSize = (size?: string): string => {
  if (!size) return 'A4';
  const s = size.toUpperCase();
  // PDFKit uses 'FOLIO', SumatraPDF uses 'folio' — unify here to uppercase
  const map: Record<string, string> = {
    FOLIO: 'FOLIO',
    A4: 'A4',
    LETTER: 'LETTER',
    TABLOID: 'TABLOID',
  };
  return map[s] ?? 'A4';
};

/**
 * Paper sizes in mm for resizing
 */
const paperSizesMm: Record<string, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  FOLIO: { width: 216, height: 330 },
  LETTER: { width: 216, height: 279 },
};

/**
 * Resize PDF to fit the target paper size by scaling content.
 */
const resizePdfToPaperSize = async (
  inputPath: string,
  outputPath: string,
  paperSize: string,
): Promise<void> => {
  const targetSize = paperSizesMm[paperSize.toUpperCase()];
  if (!targetSize) {
    // Copy original if size not defined
    fs.copyFileSync(inputPath, outputPath);
    return;
  }

  const pdfBytes = fs.readFileSync(inputPath);
  const pdfDoc = await PDFLibDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  for (const page of pages) {
    const { width, height } = page.getSize();
    // Assume PDF size is in points (1/72 inch), convert target to points
    const targetWidthPt = (targetSize.width * 72) / 25.4;
    const targetHeightPt = (targetSize.height * 72) / 25.4;

    // Check if original page is landscape (width > height)
    const isOriginalLandscape = width > height;

    // Determine target dimensions based on original orientation
    let finalWidthPt = targetWidthPt;
    let finalHeightPt = targetHeightPt;

    if (isOriginalLandscape) {
      // For landscape originals, use landscape page size
      finalWidthPt = targetHeightPt;
      finalHeightPt = targetWidthPt;
    }

    const scaleX = finalWidthPt / width;
    const scaleY = finalHeightPt / height;
    const scale = Math.min(scaleX, scaleY); // Fit to page

    page.scaleContent(scale, scale);

    // Center the content
    const newWidth = width * scale;
    const newHeight = height * scale;
    const offsetX = (finalWidthPt - newWidth) / 2;
    const offsetY = (finalHeightPt - newHeight) / 2;
    page.translateContent(offsetX, offsetY);

    // Set page size respecting original orientation
    page.setSize(finalWidthPt, finalHeightPt);
  }

  const resizedBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, resizedBytes);
};

const convertImageToPdf = async (
  imagePath: string,
  pdfPath: string,
  paperSize: string,
): Promise<void> => {
  const doc = new PDFDocument({
    size: toPdfKitSize(paperSize),
    margin: 0,
  });
  const stream = fs.createWriteStream(pdfPath);
  doc.pipe(stream);

  const imageBuffer = fs.readFileSync(imagePath);
  // Fit the image to the page while preserving aspect ratio.
  doc.image(imageBuffer, 0, 0, {
    fit: [doc.page.width, doc.page.height],
    align: 'center',
    valign: 'center',
  });

  doc.end();
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
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
const renderTextToPdf = (text: string, outputPath: string, paperSize: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: toPdfKitSize(paperSize),
        margin: 40,
        autoFirstPage: true,
      });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      doc.font('Courier').fontSize(9).text(text, { lineGap: 1, paragraphGap: 0 });

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
 * Resolve the exact Windows printer name.
 * Tries the configured name first; if SumatraPDF rejects it,
 * falls back to the first Brother printer found, then the default printer.
 */
const resolveWindowsPrinterName = (): string => {
  try {
    const raw = execSync(
      'powershell -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress"',
      { encoding: 'utf8', timeout: 8000, windowsHide: true },
    ).trim();
    const names: string[] = JSON.parse(raw);
    if (!Array.isArray(names) || names.length === 0) return config.print.printerName || '';

    const pref = config.print.printerName?.toLowerCase() ?? '';

    // 1. Exact match
    const exact = names.find((n) => n.toLowerCase() === pref);
    if (exact) return exact;

    // 2. Configured name is a substring of a real printer name
    if (pref) {
      const partial = names.find((n) => n.toLowerCase().includes(pref));
      if (partial) return partial;
    }

    // 3. Any Brother printer
    const brother = names.find((n) => /brother/i.test(n));
    if (brother) return brother;

    // 4. First non-virtual printer
    const real = names.find((n) => !/pdf|xps|fax|onenote|microsoft/i.test(n));
    return real ?? names[0] ?? '';
  } catch {
    return config.print.printerName || '';
  }
};

/**
 * Read the current Color setting from the Windows printer configuration.
 * Returns null if the call fails (e.g. printer not found, no PrintManagement module).
 */
const getWindowsPrinterColor = (printerName: string): boolean | null => {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "(Get-PrintConfiguration -PrinterName '${printerName.replace(/'/g, "''")}').Color"`,
      { encoding: 'utf8', timeout: 5000, windowsHide: true },
    ).trim();
    return out.toLowerCase() === 'true';
  } catch {
    return null;
  }
};

/**
 * Set the Windows printer's Color configuration flag.
 * This modifies the printer's stored DevMode (including Brother's private data),
 * which is more reliable than passing dmColor in the print job DevMode alone.
 */
const setWindowsPrinterColor = (printerName: string, color: boolean): void => {
  try {
    const flag = color ? '$true' : '$false';
    execSync(
      `powershell -NoProfile -Command "Set-PrintConfiguration -PrinterName '${printerName.replace(/'/g, "''")}' -Color ${flag}"`,
      { encoding: 'utf8', timeout: 5000, windowsHide: true },
    );
  } catch (err) {
    logger.warn('Failed to set printer color mode via Set-PrintConfiguration', {
      printerName,
      color,
      error: String(err).substring(0, 200),
    });
  }
};

export const printPdfFile = async (
  filePath: string,
  jobID: string,
  paperSize?: string,
  colorMode?: string,
  quality?: string,
  copies?: number,
): Promise<{ success: boolean; method: string; error?: string }> => {
  const platform = os.platform();

  if (platform === 'win32') {
    const sumatraPath = path.resolve(
      __dirname,
      '../../node_modules/pdf-to-printer/dist/SumatraPDF-3.4.6-32.exe',
    );
    const hasSumatra = fs.existsSync(sumatraPath);

    // Resolve the actual Windows printer name (auto-detects if configured name is wrong)
    const printerName = resolveWindowsPrinterName();
    logger.info('Resolved printer name', { jobID, printerName });

    // ── Set printer color mode at the Windows driver level ───────────────────
    // Brother drivers maintain private DevMode data that overrides the standard
    // dmColor field passed by the print application.  Setting the stored printer
    // configuration (Set-PrintConfiguration) propagates into that private data,
    // making it the most reliable way to enforce B&W or colour output.
    let originalColor: boolean | null = null;
    if (printerName && colorMode) {
      originalColor = getWindowsPrinterColor(printerName);
      const wantColor = colorMode !== 'bw';
      if (originalColor !== null && originalColor !== wantColor) {
        setWindowsPrinterColor(printerName, wantColor);
        logger.info('Printer color mode set', { jobID, printerName, wantColor });
      }
    }

    // Build -print-settings — comma-separated, no spaces in values
    // SumatraPDF 3.x uses 'mono' for B&W (not 'color=no')
    const buildSettings = (): string => {
      const parts: string[] = ['fitPage']; // always scale content to fill the paper
      if (paperSize) parts.push(`paper=${paperSize.toLowerCase()}`);
      if (colorMode === 'bw') parts.push('mono');
      else if (colorMode === 'color') parts.push('color');
      if (quality === 'high') parts.push('nHires');
      else if (quality === 'draft') parts.push('draft');
      if (copies && copies > 1) parts.push(`copies=${copies}`);
      return parts.join(',');
    };

    // Restore the printer's original color setting after printing (or on failure).
    const restoreColor = () => {
      if (originalColor !== null && printerName) {
        setWindowsPrinterColor(printerName, originalColor);
      }
    };

    // ── Method 1: SumatraPDF via execFileSync — no shell, args as array ──────
    if (hasSumatra) {
      try {
        const settings = buildSettings();
        const args: string[] = [];
        if (printerName) {
          args.push('-print-to', printerName);
        } else {
          args.push('-print-to-default');
        }
        args.push('-silent');
        if (settings) args.push('-print-settings', settings);
        args.push(filePath);

        execFileSync(sumatraPath, args, { stdio: 'pipe', timeout: 60000, windowsHide: true });
        logger.info('PDF printed via SumatraPDF', { jobID, printerName, paperSize, colorMode });
        restoreColor();
        return { success: true, method: 'sumatra-direct' };
      } catch (err) {
        logger.warn('SumatraPDF with settings failed, retrying with color setting only', {
          jobID,
          error: String(err).substring(0, 300),
        });
      }
    }

    // ── Method 2: SumatraPDF — bare (paper/quality dropped, color still set at driver level) ─
    if (hasSumatra) {
      try {
        const args: string[] = [];
        if (printerName) {
          args.push('-print-to', printerName);
        } else {
          args.push('-print-to-default');
        }
        args.push('-silent', filePath);

        execFileSync(sumatraPath, args, { stdio: 'pipe', timeout: 60000, windowsHide: true });
        logger.info('PDF printed via SumatraPDF (bare)', { jobID, printerName, colorMode });
        restoreColor();
        return { success: true, method: 'sumatra-bare' };
      } catch (err) {
        logger.warn('SumatraPDF bare failed, trying PowerShell', {
          jobID,
          error: String(err).substring(0, 300),
        });
      }
    }

    // ── Method 3: PowerShell Start-Process -Verb PrintTo ─────────────────────
    try {
      const psArgs = printerName
        ? `Start-Process -FilePath '${filePath.replace(/'/g, "''")}' -Verb PrintTo -ArgumentList '${printerName.replace(/'/g, "''")}' -Wait`
        : `Start-Process -FilePath '${filePath.replace(/'/g, "''")}' -Verb Print -Wait`;
      execSync(`powershell -NoProfile -Command "${psArgs}"`, {
        stdio: 'pipe',
        timeout: 30000,
        windowsHide: true,
      });
      logger.info('PDF printed via PowerShell PrintTo', { jobID, printerName });
      restoreColor();
      return { success: true, method: 'ps-printto' };
    } catch (err) {
      logger.warn('PowerShell PrintTo failed', { jobID, error: String(err).substring(0, 200) });
    }

    restoreColor();
    return {
      success: false,
      method: 'windows-all-failed',
      error: `All Windows PDF print methods failed. Printer: "${printerName}"`,
    };
  }

  // ── Linux / macOS — use lp ─────────────────────────────────────────────────
  try {
    const printerArg = config.print.printerName ? `-d "${config.print.printerName}"` : '';
    const copiesArg = copies && copies > 1 ? `-n ${copies}` : '';
    execSync(`lp ${printerArg} ${copiesArg} "${filePath}"`, { stdio: 'pipe', timeout: 10000 });
    logger.info('PDF printed via lp', { jobID, platform });
    return { success: true, method: 'lp' };
  } catch (err) {
    logger.warn('lp failed, trying lpr', { jobID, error: String(err).substring(0, 200) });
    try {
      const copiesArg = copies && copies > 1 ? `-#${copies}` : '';
      execSync(`lpr ${copiesArg} "${filePath}"`, { stdio: 'pipe', timeout: 10000 });
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
  options?: Partial<PrintOptions>,
): Promise<PrintResult> => {
  const jobID = `JOB-${Date.now()}`;
  const paperSize = options?.paperSize ?? 'A4';
  const colorMode = options?.colorMode;
  const quality = options?.quality;
  logger.info('Print text request', {
    jobID,
    contentLength: text.length,
    paperSize,
    colorMode,
    quality,
  });

  const tempPdf = path.join(os.tmpdir(), `print_${jobID}.pdf`);

  try {
    // 1. Render text → PDF
    await renderTextToPdf(text, tempPdf, paperSize);
    logger.info('Text rendered to PDF', { jobID, tempPdf });

    // 2. Print the PDF
    const result = await printPdfFile(tempPdf, jobID, paperSize, colorMode, quality);
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
    try {
      fs.unlinkSync(tempPdf);
    } catch {
      /* temp file may not exist */
    }
  }
};

/**
 * Print receipt content
 */
export const printReceipt = async (
  receiptContent: string,
  paperSize?: string,
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
  paperSize?: string,
): Promise<PrintResult> => {
  logger.info('Printing document', { documentName, paperSize });
  return printText(documentContent, { paperSize: paperSize ?? 'A4' });
};

// ─────────────────────────────────────────────────────────────────────────────// Document conversion helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert document files to PDF using LibreOffice (soffice command).
 * Assumes LibreOffice is installed in the default location.
 */
const convertDocumentToPdf = async (inputPath: string, outputPath: string): Promise<void> => {
  try {
    // Use full path to LibreOffice soffice.exe on Windows
    const sofficePath = 'C:\\Program Files\\LibreOffice\\program\\soffice.exe';
    execSync(`"${sofficePath}" --headless --convert-to pdf --outdir "${path.dirname(outputPath)}" "${inputPath}"`, {
      timeout: 30000, // 30 seconds timeout
      stdio: 'pipe',
    });

    // LibreOffice names the output file based on input, so rename if necessary
    const expectedOutput = path.join(
      path.dirname(outputPath),
      path.basename(inputPath, path.extname(inputPath)) + '.pdf'
    );

    if (expectedOutput !== outputPath) {
      fs.renameSync(expectedOutput, outputPath);
    }
  } catch (err) {
    throw new Error(`Document conversion failed: ${String(err)}`);
  }
};

// ─────────────────────────────────────────────────────────────────────────────// Print files from storage
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Print files located in the Uploads directory.
 * PDFs → pdf-to-printer directly.
 * Other files → rendered to PDF via PDFKit, then printed.
 * When simulation mode is on, files are also copied to PrintSimulation/.
 */
export const printFilesFromStorage = async (
  filenames: string[],
  paperSize?: string,
  colorMode?: string,
  quality?: string,
  copies?: number,
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
        const tempResizedPdf = path.join(
          os.tmpdir(),
          `resized_${jobID}_${path.basename(filename, '.pdf')}.pdf`,
        );
        try {
          await resizePdfToPaperSize(filePath, tempResizedPdf, paperSize || 'A4');
          const result = await printPdfFile(tempResizedPdf, jobID, paperSize, colorMode, quality, copies);
          printSuccess = result.success;
          if (!result.success) {
            logger.error('PDF print failed', { filename, error: result.error });
          }
          const simPath = copyToSimulation(filePath, filename);
          if (simPath) simulatedPaths.push(simPath);
        } finally {
          try {
            fs.unlinkSync(tempResizedPdf);
          } catch (_e) {
            /* temp file may already be gone */
          }
        }
      } else if (['.jpg', '.jpeg', '.png', '.bmp', '.gif'].includes(ext)) {
        // Image files: convert to PDF with the requested paper size before printing.
        const tempPdf = path.join(
          os.tmpdir(),
          `image_print_${jobID}_${path.basename(filename, ext)}.pdf`,
        );
        try {
          await convertImageToPdf(filePath, tempPdf, paperSize || 'A4');
          const result = await printPdfFile(tempPdf, jobID, paperSize, colorMode, quality, copies);
          printSuccess = result.success;
          if (!result.success) {
            logger.error('Image PDF print failed', { filename, error: result.error });
          }
          const simPath = copyToSimulation(filePath, filename);
          if (simPath) simulatedPaths.push(simPath);
        } catch (imageErr) {
          logger.error('Image conversion or print failed', { filename, error: String(imageErr) });
        } finally {
          try {
            fs.unlinkSync(tempPdf);
          } catch (_e) {
            /* temp file may already be gone */
          }
        }
      } else if (['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.rtf'].includes(ext)) {
        // Document files: convert to PDF using LibreOffice if available
        const tempPdf = path.join(
          os.tmpdir(),
          `doc_print_${jobID}_${path.basename(filename, ext)}.pdf`,
        );
        const tempResizedPdf = path.join(
          os.tmpdir(),
          `resized_doc_print_${jobID}_${path.basename(filename, ext)}.pdf`,
        );
        try {
          await convertDocumentToPdf(filePath, tempPdf);
          await resizePdfToPaperSize(tempPdf, tempResizedPdf, paperSize || 'A4');
          const result = await printPdfFile(tempResizedPdf, jobID, paperSize, colorMode, quality, copies);
          printSuccess = result.success;
          if (!result.success) {
            logger.error('Document PDF print failed', { filename, error: result.error });
          }
          const simPath = copyToSimulation(filePath, filename);
          if (simPath) simulatedPaths.push(simPath);
        } catch (docErr) {
          logger.error('Document conversion or print failed', { filename, error: String(docErr) });
          // Fallback: try to read as text
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const result = await printText(content, { paperSize, colorMode, quality });
            printSuccess = result.success;
            if (result.simulatedPaths) simulatedPaths.push(...result.simulatedPaths);
          } catch (textErr) {
            logger.error('Could not process document as text either', { filename, error: String(textErr) });
          }
        } finally {
          try {
            fs.unlinkSync(tempPdf);
            fs.unlinkSync(tempResizedPdf);
          } catch (_e) {
            /* temp files may already be gone */
          }
        }
      } else {
        // Non-PDF: read as text, render to PDF, print
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const result = await printText(content, { paperSize, colorMode, quality });
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
    const pdfModule = await import('pdf-to-printer');
    const getPrintersFn: (() => Promise<{ name: string; paperSizes?: string[] }[]>) | undefined =
      ((pdfModule as Record<string, unknown>).getPrinters as typeof getPrintersFn) ??
      ((pdfModule.default as Record<string, unknown> | undefined)
        ?.getPrinters as typeof getPrintersFn);

    if (typeof getPrintersFn !== 'function') throw new Error('getPrinters not found');
    const printers = await getPrintersFn();
    logger.info('Retrieved printers via pdf-to-printer', { count: printers.length });
    return printers.map((p) => ({ name: p.name, paperSizes: p.paperSizes ?? [] }));
  } catch (importErr) {
    logger.warn('pdf-to-printer not available for printer list', { error: String(importErr) });
  }

  // ── PowerShell fallback (Windows) ─────────────────────────────────────────
  if (os.platform() === 'win32') {
    try {
      const out = execSync(
        'powershell -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name"',
        { encoding: 'utf-8', timeout: 5000, windowsHide: true },
      );
      const names = out
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      logger.info('Retrieved printers via PowerShell', { count: names.length });
      return names.map((name) => ({ name, paperSizes: [] }));
    } catch (err) {
      logger.warn('PowerShell printer list failed', { error: String(err) });
    }
  }

  // ── lpstat fallback (Linux / macOS) ──────────────────────────────────────
  try {
    const out = execSync('lpstat -a', { encoding: 'utf-8', timeout: 5000 });
    const names = out
      .split('\n')
      .map((line) => line.split(' ')[0])
      .filter(Boolean);
    return names.map((name) => ({ name, paperSizes: [] }));
  } catch {
    return [];
  }
};
