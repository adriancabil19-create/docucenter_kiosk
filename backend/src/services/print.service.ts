import { logger } from '../utils/logger';
import { execSync, execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { config } from '../utils/config';
import PDFDocument from 'pdfkit';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import sharp from 'sharp';

/**
 * Paper sizes the printer's duplex unit can physically handle. Folio ("long"
 * bond paper) jams the duplexer — confirmed on the actual kiosk printer —
 * so duplex is only ever offered for A4/Letter ("short"). Enforced here
 * (not just hidden in the kiosk UI) so a stale client or a direct API call
 * can't request duplex on Folio.
 */
const DUPLEX_CAPABLE_PAPER_SIZES = new Set(['a4', 'letter']);

export const isDuplexCapablePaperSize = (paperSize?: string): boolean =>
  !!paperSize && DUPLEX_CAPABLE_PAPER_SIZES.has(paperSize.toLowerCase());

interface PrintOptions {
  type?: string;
  printerName?: string;
  paperSize?: string; // 'A4' | 'Folio' | 'Letter'
  colorMode?: string; // 'bw' | 'color'
  quality?: string; // 'draft' | 'standard' | 'high'
  /** Text alignment for `printText`-rendered PDFs. Receipts are centered on
   * the page; plain documents stay left-aligned. */
  align?: 'left' | 'center';
}

export interface PrintResult {
  success: boolean;
  jobID?: string;
  error?: string;
  method?: string;
  simulatedPaths?: string[];
  /** Actual pages produced (image-layout jobs only) — the true count after
   * unprocessable images were dropped, as opposed to an estimate from the
   * originally requested file list. */
  pagesGenerated?: number;
  /** The Windows printer the job was actually sent to, when resolved. */
  printerName?: string;
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
// Multi-image layout printing (N-up photo sheets)
// ─────────────────────────────────────────────────────────────────────────────

export interface ImageLayoutOptions {
  imagesPerPage: number; // 1 | 2 | 4 | 6 | 9
  imageSize?: string; // 'auto' | '1R' | '2R' | '3R' | '4R' | '5R' | 'custom'
  customWidthIn?: number;
  customHeightIn?: number;
  orientation?: string; // 'auto' | 'portrait' | 'landscape'
}

/** Standard photo print sizes, in inches. */
const PHOTO_SIZES_IN: Record<string, { w: number; h: number }> = {
  '1R': { w: 1.25, h: 1.75 },
  '2R': { w: 2.5, h: 3.5 },
  '3R': { w: 3.5, h: 5 },
  '4R': { w: 4, h: 6 },
  '5R': { w: 5, h: 7 },
};

/** Grid shape (columns x rows) for each supported images-per-page preset. */
const LAYOUT_GRID: Record<number, { cols: number; rows: number }> = {
  1: { cols: 1, rows: 1 },
  2: { cols: 1, rows: 2 },
  4: { cols: 2, rows: 2 },
  6: { cols: 2, rows: 3 },
  9: { cols: 3, rows: 3 },
};

/** Valid images-per-page presets — the keys of LAYOUT_GRID above. Exported
 * so callers (e.g. routes/print.ts) derive this from one source instead of
 * maintaining a second copy that can drift out of sync. */
export const VALID_IMAGES_PER_PAGE = new Set(Object.keys(LAYOUT_GRID).map(Number));

const IMAGE_PAGE_MARGIN_PT = 18; // ~0.25in
const IMAGE_PAGE_GUTTER_PT = 10;

/**
 * Compose a set of images into a single multi-page PDF laid out N-per-page.
 * Each source image is normalised through sharp first: EXIF auto-rotation
 * (phone photos are frequently stored sideways with a rotation flag),
 * transparent PNGs flattened onto white, and re-encoded as JPEG so pdf-lib
 * only ever has to embed one image type. Images that fail to load/decode are
 * skipped (not fatal) so one corrupt file doesn't sink the whole job.
 */
const convertImagesToLayoutPdf = async (
  imagePaths: string[],
  outputPdfPath: string,
  paperSize: string,
  layout: ImageLayoutOptions,
): Promise<{ pagesGenerated: number; skipped: string[] }> => {
  const imagesPerPage = LAYOUT_GRID[layout.imagesPerPage] ? layout.imagesPerPage : 1;
  const grid = LAYOUT_GRID[imagesPerPage];

  const pdfDoc = await PDFLibDocument.create();
  const embedded: { img: Awaited<ReturnType<typeof pdfDoc.embedJpg>>; widthPx: number; heightPx: number }[] = [];
  const skipped: string[] = [];

  for (const imagePath of imagePaths) {
    try {
      const raw = await fs.promises.readFile(imagePath);
      const pipeline = sharp(raw).rotate().flatten({ background: '#ffffff' });
      const { data: normalized, info } = await pipeline
        .jpeg({ quality: 92 })
        .toBuffer({ resolveWithObject: true });
      if (!info.width || !info.height) throw new Error('Image dimensions unavailable');
      const img = await pdfDoc.embedJpg(normalized);
      embedded.push({ img, widthPx: info.width, heightPx: info.height });
    } catch (err) {
      logger.warn('Skipping image that could not be processed for layout print', {
        imagePath,
        error: String(err),
      });
      skipped.push(imagePath);
    }
  }

  if (embedded.length === 0) {
    throw new Error('No valid images could be processed for printing');
  }

  // Orientation: explicit choice wins. "Auto" only prefers landscape for the
  // single-image-per-page case when that image is wider than tall — N-up
  // sheets (2/4/6/9) stay portrait regardless, matching the standard layout.
  let orientation = layout.orientation ?? 'auto';
  if (orientation === 'auto') {
    const first = embedded[0];
    orientation = imagesPerPage === 1 && first.widthPx > first.heightPx ? 'landscape' : 'portrait';
  }

  const sizeMm = paperSizesMm[paperSize.toUpperCase()] ?? paperSizesMm.A4;
  let pageWidthPt = (sizeMm.width * 72) / 25.4;
  let pageHeightPt = (sizeMm.height * 72) / 25.4;
  if (orientation === 'landscape') {
    [pageWidthPt, pageHeightPt] = [pageHeightPt, pageWidthPt];
  }

  const usableWidthPt = pageWidthPt - IMAGE_PAGE_MARGIN_PT * 2 - IMAGE_PAGE_GUTTER_PT * (grid.cols - 1);
  const usableHeightPt = pageHeightPt - IMAGE_PAGE_MARGIN_PT * 2 - IMAGE_PAGE_GUTTER_PT * (grid.rows - 1);
  const cellWidthPt = usableWidthPt / grid.cols;
  const cellHeightPt = usableHeightPt / grid.rows;

  const fixedBoxPt = (() => {
    if (!layout.imageSize || layout.imageSize === 'auto') return null;
    if (layout.imageSize === 'custom') {
      const w = layout.customWidthIn;
      const h = layout.customHeightIn;
      if (typeof w !== 'number' || typeof h !== 'number' || !(w > 0) || !(h > 0)) return null;
      return { w: w * 72, h: h * 72 };
    }
    const preset = PHOTO_SIZES_IN[layout.imageSize];
    return preset ? { w: preset.w * 72, h: preset.h * 72 } : null;
  })();

  for (let i = 0; i < embedded.length; i += imagesPerPage) {
    const pageImages = embedded.slice(i, i + imagesPerPage);
    const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);

    pageImages.forEach((entry, idx) => {
      const col = idx % grid.cols;
      const row = Math.floor(idx / grid.cols);
      const cellX = IMAGE_PAGE_MARGIN_PT + col * (cellWidthPt + IMAGE_PAGE_GUTTER_PT);
      const cellTopY = IMAGE_PAGE_MARGIN_PT + row * (cellHeightPt + IMAGE_PAGE_GUTTER_PT);
      const cellY = pageHeightPt - cellTopY - cellHeightPt; // pdf-lib origin is bottom-left

      // Box the image is fit into: a fixed preset size (clamped to the cell)
      // or the full cell for "Automatic". Aspect ratio is always preserved —
      // the image is scaled to fit inside the box, never cropped.
      const boxW = Math.min(fixedBoxPt?.w ?? cellWidthPt, cellWidthPt);
      const boxH = Math.min(fixedBoxPt?.h ?? cellHeightPt, cellHeightPt);
      const aspect = entry.widthPx / entry.heightPx;
      let drawW = boxW;
      let drawH = drawW / aspect;
      if (drawH > boxH) {
        drawH = boxH;
        drawW = drawH * aspect;
      }

      const x = cellX + (cellWidthPt - drawW) / 2;
      const y = cellY + (cellHeightPt - drawH) / 2;
      page.drawImage(entry.img, { x, y, width: drawW, height: drawH });
    });
  }

  const bytes = await pdfDoc.save();
  fs.writeFileSync(outputPdfPath, bytes);
  return { pagesGenerated: Math.ceil(embedded.length / imagesPerPage), skipped };
};

/**
 * Print a batch of images as a single N-up layout job (one multi-page PDF,
 * printed once so native printer "copies" produce correctly collated sets).
 */
export const printImageLayoutJob = async (
  filenames: string[],
  opts: {
    paperSize?: string;
    colorMode?: string;
    quality?: string;
    copies?: number;
  } & ImageLayoutOptions,
): Promise<PrintResult> => {
  if (!fs.existsSync(uploadsDir)) {
    logger.warn('Uploads directory does not exist', { uploadsDir });
    return { success: false, error: 'Uploads directory not found' };
  }

  const jobID = `JOB-${Date.now()}`;
  const validPaths: string[] = [];
  // Filenames dropped here (unsafe path, missing file, unsupported extension)
  // never reach convertImagesToLayoutPdf's own skip-tracking — count them
  // too, so the reported skip count (and thus the caller's page/paper
  // accounting) reflects every image that didn't make it into the PDF.
  let preSkippedCount = 0;
  for (const filename of filenames) {
    const filePath = path.join(uploadsDir, filename);
    if (!isSafePath(filePath, uploadsDir) || !fs.existsSync(filePath)) {
      preSkippedCount++;
      continue;
    }
    if (!['.jpg', '.jpeg', '.png'].includes(path.extname(filename).toLowerCase())) {
      preSkippedCount++;
      continue;
    }
    validPaths.push(filePath);
  }

  if (validPaths.length === 0) {
    return { success: false, error: 'No valid images found to print', jobID };
  }

  const tempPdf = path.join(os.tmpdir(), `image_layout_${jobID}.pdf`);
  try {
    const { pagesGenerated, skipped } = await convertImagesToLayoutPdf(
      validPaths,
      tempPdf,
      opts.paperSize || 'A4',
      opts,
    );
    const totalSkipped = preSkippedCount + skipped.length;
    const printRes = await printPdfFile(tempPdf, jobID, opts.paperSize, opts.colorMode, opts.quality, opts.copies);

    const simulatedPaths: string[] = [];
    if (config.print.simulationEnabled) {
      const simPath = copyToSimulation(tempPdf, `image_layout_${jobID}.pdf`);
      if (simPath) simulatedPaths.push(simPath);
    }

    if (!printRes.success) {
      logger.error('Image layout print failed', { jobID, error: printRes.error });
      return {
        success: false,
        error: 'Unable to print the selected images. Please try again.',
        jobID,
        pagesGenerated,
      };
    }

    return {
      success: true,
      jobID,
      method: printRes.method,
      simulatedPaths: simulatedPaths.length > 0 ? simulatedPaths : undefined,
      pagesGenerated,
      error: totalSkipped > 0 ? `${totalSkipped} image(s) could not be processed and were skipped` : undefined,
    };
  } catch (err) {
    logger.error('Image layout job failed', { jobID, error: String(err) });
    return { success: false, error: 'Unable to process the selected images for printing', jobID };
  } finally {
    try {
      fs.unlinkSync(tempPdf);
    } catch (_e) {
      /* temp file may already be gone */
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Root of the project (two levels above /backend/src/services) */
const projectRoot = path.resolve(__dirname, '../../..');

/** Uploads directory */
const uploadsDir = config.uploadsPath;

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
  paperSize: string,
  align: 'left' | 'center' = 'left',
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

      doc.font('Courier').fontSize(9).text(text, { lineGap: 1, paragraphGap: 0, align });

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

/**
 * Print quality (draft/standard/high) control.
 *
 * SumatraPDF's -print-settings has NO quality/resolution/DPI token at all —
 * only fitpage/noscale/shrink, color/monochrome, duplex modes, odd/even,
 * landscape/portrait, and bin=X (see pdf-to-printer's own docs). The 'draft'
 * and 'nHires' values previously pushed into that string were never
 * recognized by SumatraPDF and were silently ignored, which is why draft,
 * standard, and high all printed identically — quality was never actually
 * being applied anywhere.
 *
 * The real, driver-level control is the printer's own PrintTicketXml (Print
 * Schema) psk:PageOutputQuality feature. Verified directly against the live
 * printer which options its driver actually accepts (round-tripped via
 * Set-PrintConfiguration / Get-PrintConfiguration): psk:Draft, psk:Normal,
 * psk:High, and psk:Photographic all apply and stick. Everything else tried
 * — psk:Text, psk:Automatic, psk:Fax, and several guesses at a Brother
 * "Graphic/Map" option name (brpsk:Graph, brpsk:Map, brpsk:GraphMap,
 * brpsk:GraphicMap, brpsk:GraphicsMap, psk:Graphics) — was rejected and
 * silently reverted by the driver. That "Graphic/Map" preset visible in
 * Brother's own UI is not reachable through the standard Windows print API
 * at all, so it can't be targeted here.
 *
 * Printing and photocopying share the SAME mapping (Draft/Normal/High).
 * photocopying originally tried Normal/Graphic-Map/Photo (with Photographic
 * standing in for the unreachable "Graphic/Map"), but psk:Photographic
 * turned out to both look paler AND shift color versus psk:Normal on plain
 * paper (this kiosk's only stock) — confirmed by a full structural diff of
 * the printer's own ticket, which showed psk:Photographic changes nothing
 * else color-related, meaning the shift happens inside the driver's opaque
 * rendering pipeline, not something a different ticket value can fix.
 * psk:High was verified (via the same real-printer testing used for
 * everything above) to look genuinely correct in Printing Service, so
 * photocopying now reuses it instead of chasing "Photo" any further.
 */
const QUALITY_TICKET_OPTION: Record<string, string> = {
  draft: 'psk:Draft',
  standard: 'psk:Normal',
  high: 'psk:High',
};

const getWindowsPrinterTicketXml = (printerName: string): string | null => {
  try {
    return execSync(
      `powershell -NoProfile -Command "(Get-PrintConfiguration -PrinterName '${printerName.replace(/'/g, "''")}').PrintTicketXml"`,
      { encoding: 'utf8', timeout: 5000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
    );
  } catch {
    return null;
  }
};

const applyWindowsPrinterTicketXml = (printerName: string, ticketXml: string): boolean => {
  const tmpFile = path.join(os.tmpdir(), `print_ticket_${Date.now()}_${Math.random().toString(36).slice(2)}.xml`);
  try {
    fs.writeFileSync(tmpFile, ticketXml, 'utf8');
    execSync(
      `powershell -NoProfile -Command "Set-PrintConfiguration -PrinterName '${printerName.replace(/'/g, "''")}' -PrintTicketXml (Get-Content -Raw -Path '${tmpFile.replace(/'/g, "''")}')"`,
      { encoding: 'utf8', timeout: 8000, windowsHide: true },
    );
    return true;
  } catch (err) {
    logger.warn('Failed to apply printer PrintTicketXml', {
      printerName,
      error: String(err).substring(0, 300),
    });
    return false;
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // Best-effort cleanup.
    }
  }
};

/**
 * Patch the printer's stored ticket to the requested quality and apply it.
 * Returns the ORIGINAL ticket XML (for the caller to restore afterward) on
 * success, or null if the driver doesn't expose this feature or the quality
 * value is unrecognized — in which case nothing was changed, matching the
 * previous no-op behaviour rather than risking a malformed ticket.
 */
const setWindowsPrinterQuality = (printerName: string, quality: string): string | null => {
  const option = QUALITY_TICKET_OPTION[quality];
  if (!option) return null;

  const current = getWindowsPrinterTicketXml(printerName);
  if (!current) return null;

  const pattern = /<psf:Feature name="psk:PageOutputQuality"><psf:Option name="psk:[A-Za-z]+"\s*\/><\/psf:Feature>/;
  if (!pattern.test(current)) return null;
  if (current.includes(`<psf:Option name="${option}"/>`)) return null; // already set — nothing to restore

  const patched = current.replace(
    pattern,
    `<psf:Feature name="psk:PageOutputQuality"><psf:Option name="${option}"/></psf:Feature>`,
  );
  return applyWindowsPrinterTicketXml(printerName, patched) ? current : null;
};

/** Driver color/quality state captured before a batch of pages, so it can be
 * applied once per JOB instead of once per PAGE — see prepareWindowsPrinterDriverState. */
export interface PrinterDriverJobState {
  printerName: string | null;
  originalColor: boolean | null;
  originalTicketXml: string | null;
}

/**
 * Apply color + quality driver settings ONCE for a whole batch of pages/
 * copies, instead of letting printPdfFile do it on every single call.
 *
 * Each of getWindowsPrinterColor/setWindowsPrinterColor/
 * getWindowsPrinterTicketXml/applyWindowsPrinterTicketXml spawns a fresh
 * powershell.exe process synchronously (execSync) — cold PowerShell startup
 * alone is commonly several hundred ms, and the ticket read/write handles a
 * ~20KB XML file. Doing this before AND after every page of a multi-page,
 * multi-copy photocopy job (the loop in executePhotocopySession) meant up to
 * ~7 blocking shell-outs per page, all on Node's single thread — enough to
 * stall every other request (including the kiosk's own status/assistance
 * polling) for several seconds during a real print job. Callers that print
 * more than one page per job should call this once, pass the result to every
 * printPdfFile call via `driverState`, and call
 * restoreWindowsPrinterDriverState once at the end instead.
 */
export const prepareWindowsPrinterDriverState = (
  colorMode?: string,
  quality?: string,
): PrinterDriverJobState => {
  if (os.platform() !== 'win32') return { printerName: null, originalColor: null, originalTicketXml: null };

  const printerName = resolveWindowsPrinterName();

  let originalColor: boolean | null = null;
  if (printerName && colorMode) {
    originalColor = getWindowsPrinterColor(printerName);
    const wantColor = colorMode !== 'bw';
    if (originalColor !== null && originalColor !== wantColor) {
      setWindowsPrinterColor(printerName, wantColor);
      logger.info('Printer color mode set', { printerName, wantColor });
    }
  }

  let originalTicketXml: string | null = null;
  if (printerName && quality) {
    originalTicketXml = setWindowsPrinterQuality(printerName, quality);
    if (originalTicketXml) {
      logger.info('Printer quality set', { printerName, quality });
    }
  }

  return { printerName, originalColor, originalTicketXml };
};

/** Restore whatever prepareWindowsPrinterDriverState changed. Call once, after the whole batch. */
export const restoreWindowsPrinterDriverState = (state: PrinterDriverJobState): void => {
  if (!state.printerName) return;
  if (state.originalColor !== null) {
    setWindowsPrinterColor(state.printerName, state.originalColor);
  }
  if (state.originalTicketXml) {
    applyWindowsPrinterTicketXml(state.printerName, state.originalTicketXml);
  }
};

export const printPdfFile = async (
  filePath: string,
  jobID: string,
  paperSize?: string,
  colorMode?: string,
  quality?: string,
  copies?: number,
  driverState?: PrinterDriverJobState,
  duplex?: boolean,
): Promise<{ success: boolean; method: string; error?: string }> => {
  const platform = os.platform();
  // Silently downgrades to simplex rather than rejecting the job outright —
  // by the time this runs, payment is already taken; refusing to print
  // would strand the customer. The kiosk UI and the route handler both
  // already gate this before the job is ever created (see
  // isDuplexCapablePaperSize), so this only fires for a stale client.
  const wantDuplex = !!duplex && isDuplexCapablePaperSize(paperSize);
  if (duplex && !wantDuplex) {
    logger.warn('Duplex requested on a paper size the printer cannot duplex — printing simplex', {
      jobID,
      paperSize,
    });
  }

  if (platform === 'win32') {
    const sumatraPath = path.resolve(
      __dirname,
      '../../node_modules/pdf-to-printer/dist/SumatraPDF-3.4.6-32.exe',
    );
    const hasSumatra = fs.existsSync(sumatraPath);

    // If the caller already prepared driver state for a whole batch (see
    // prepareWindowsPrinterDriverState), reuse it and skip re-resolving /
    // re-configuring the driver on every page. Otherwise, self-manage
    // exactly as before for single-shot callers (printText, printFromStorage
    // per single-file requests, image layout printing).
    const managesOwnDriverState = !driverState;
    const printerName = driverState ? driverState.printerName : resolveWindowsPrinterName();
    logger.info('Resolved printer name', { jobID, printerName });

    let originalColor: boolean | null = null;
    let originalTicketXml: string | null = null;
    if (managesOwnDriverState) {
      // ── Set printer color mode at the Windows driver level ─────────────────
      // Brother drivers maintain private DevMode data that overrides the
      // standard dmColor field passed by the print application. Setting the
      // stored printer configuration (Set-PrintConfiguration) propagates
      // into that private data, making it the most reliable way to enforce
      // B&W or colour output.
      if (printerName && colorMode) {
        originalColor = getWindowsPrinterColor(printerName);
        const wantColor = colorMode !== 'bw';
        if (originalColor !== null && originalColor !== wantColor) {
          setWindowsPrinterColor(printerName, wantColor);
          logger.info('Printer color mode set', { jobID, printerName, wantColor });
        }
      }

      // ── Set print quality at the driver level (see setWindowsPrinterQuality) ──
      // SumatraPDF has no quality/resolution setting to pass here at all.
      if (printerName && quality) {
        originalTicketXml = setWindowsPrinterQuality(printerName, quality);
        if (originalTicketXml) {
          logger.info('Printer quality set', { jobID, printerName, quality });
        }
      }
    }

    // Build -print-settings — comma-separated, no spaces in values
    // SumatraPDF 3.x uses 'mono' for B&W (not 'color=no'). No quality/DPI
    // token exists here — that's handled above via PrintTicketXml instead.
    // 'duplex' (vs 'duplexshort'/'duplexlong') is documented by pdf-to-printer
    // (see node_modules/pdf-to-printer/README.md, the `side` option) as a
    // distinct valid value — deliberately not forcing a specific flip edge
    // since that hasn't been verified against the real printer.
    const buildSettings = (): string => {
      const parts: string[] = ['fitPage']; // always scale content to fill the paper
      if (paperSize) parts.push(`paper=${paperSize.toLowerCase()}`);
      if (colorMode === 'bw') parts.push('mono');
      else if (colorMode === 'color') parts.push('color');
      if (copies && copies > 1) parts.push(`copies=${copies}`);
      parts.push(wantDuplex ? 'duplex' : 'simplex');
      return parts.join(',');
    };

    // Restore the printer's original color/quality settings after printing
    // (or on failure) — only when THIS call is the one that changed them.
    // When a caller passed driverState, restoration is its responsibility
    // (once, after its whole batch), not ours per-page.
    const restoreColor = () => {
      if (!managesOwnDriverState || !printerName) return;
      if (originalColor !== null) {
        setWindowsPrinterColor(printerName, originalColor);
      }
      if (originalTicketXml) {
        applyWindowsPrinterTicketXml(printerName, originalTicketXml);
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
  const align = options?.align ?? 'left';
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
    await renderTextToPdf(text, tempPdf, paperSize, align);
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
  return printText(receiptContent, { paperSize: paperSize ?? 'A4', align: 'center' });
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
  duplex?: boolean,
): Promise<PrintResult> => {
  if (!fs.existsSync(uploadsDir)) {
    logger.warn('Uploads directory does not exist', { uploadsDir });
    return { success: false, error: 'Uploads directory not found' };
  }

  let processedCount = 0;
  const simulatedPaths: string[] = [];
  const jobID = `JOB-${Date.now()}`;

  // Same color/quality for every file in this request — configure the
  // driver once instead of once per file (see prepareWindowsPrinterDriverState).
  const driverState = prepareWindowsPrinterDriverState(colorMode, quality);
  try {
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
          const result = await printPdfFile(tempResizedPdf, jobID, paperSize, colorMode, quality, copies, driverState, duplex);
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
          const result = await printPdfFile(tempPdf, jobID, paperSize, colorMode, quality, copies, driverState, duplex);
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
          const result = await printPdfFile(tempResizedPdf, jobID, paperSize, colorMode, quality, copies, driverState, duplex);
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
  } finally {
    restoreWindowsPrinterDriverState(driverState);
  }

  const printerName = driverState.printerName || undefined;

  if (processedCount === 0) {
    return {
      success: false,
      error: 'No files were successfully processed for printing',
      jobID,
      printerName,
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
    printerName,
    error:
      processedCount < filenames.length
        ? `Partial print: ${filenames.length - processedCount} of ${filenames.length} file(s) could not be printed`
        : undefined,
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
