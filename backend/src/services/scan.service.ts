import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import { config } from '../utils/config';
import { scannerLock } from './device-lock';

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────────────────────

interface ScanOptions {
  colorMode?: 'color' | 'bw';
  dpi?: number;
  paperSize?: string;
  outputFormat?: 'pdf' | 'jpg' | 'png';
  /** Scan both sides of each sheet via the ADF's duplex unit. Unlike duplex
   * printing, this has no paper-size restriction — the scanner (unlike the
   * printer) has no known long-paper duplex limitation. Depends on the
   * physical scanner having a duplex-capable ADF; if it doesn't, DWT should
   * surface a capability error rather than silently scanning one-sided —
   * not yet confirmed against the real hardware. */
  duplex?: boolean;
}

interface ScanResult {
  success: boolean;
  filePath?: string;
  error?: string;
  method?: string;
}

interface CopyOptions {
  copies?: number;
  colorMode?: 'color' | 'bw';
  paperSize?: string;
  quality?: string;
  /** Both scan (both sides of each sheet) and print (both sides of each
   * output sheet) two-sided, like a real photocopier's duplex button. */
  duplex?: boolean;
}

interface CopyResult {
  success: boolean;
  jobId?: string;
  error?: string;
}

interface ADFStatus {
  ready: boolean;
  status: string;
  error?: string;
  scannerConnected?: boolean;
  adfLoaded?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamsoft Web TWAIN (DWT) local service helpers
// ─────────────────────────────────────────────────────────────────────────────

const DWT_HOST = '127.0.0.1';
const DWT_PORT = 18622;
const DWT_DCP_PORT = 18625;
const DWT_DCP_VERSION = 'dwasm2_19301028';
const DWT_LICENSE = config.dynamsoftLicense;

function dwtRequest(
  method: string,
  urlPath: string,
  body?: object,
  timeoutMs = 30000,
): Promise<{ status: number; data: Buffer }> {
  return new Promise((resolve, reject) => {
    const bodyBuf = body ? Buffer.from(JSON.stringify(body), 'utf8') : undefined;
    const req = http.request(
      {
        hostname: DWT_HOST,
        port: DWT_PORT,
        path: urlPath,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(bodyBuf ? { 'Content-Length': bodyBuf.length } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, data: Buffer.concat(chunks) }));
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`DWT request timed out: ${method} ${urlPath}`));
    });
    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

/**
 * Create a DWT scan job, with ONE bounded retry on failure.
 *
 * The WIA-bridge scanner device this app selects (see the scanner-selection
 * comments below — the real TWAIN driver fails outright, so the WIA bridge
 * is the only usable path) doesn't always release the physical scanner
 * instantly when a previous job closes, especially after a longer
 * multi-page ADF session. Immediately starting a new job in that window
 * (e.g. tapping Scan Page right after Finish on a prior multi-page scan)
 * can get "createJob failed (HTTP 403): Operation time out." even though
 * the scanner is fine a moment later. One retry after a short pause covers
 * that transient window without masking a genuine failure — if the retry
 * also fails, the error is real and gets surfaced as-is.
 */
async function createScanJobWithRetry(
  jobBody: object,
  timeoutMs = 60000,
): Promise<{ status: number; data: Buffer }> {
  const first = await dwtRequest('POST', '/DWTAPI/ScanJobs', jobBody, timeoutMs);
  if (first.status === 201) return first;

  logger.warn('DWT createJob failed, retrying once after a short pause', {
    status: first.status,
    detail: first.data.toString('utf8').trim().slice(0, 200),
  });
  await new Promise((r) => setTimeout(r, 2000));
  return dwtRequest('POST', '/DWTAPI/ScanJobs', jobBody, timeoutMs);
}

// ─────────────────────────────────────────────────────────────────────────────
// DWT self-healing helpers
// ─────────────────────────────────────────────────────────────────────────────

// Returns true if DWT's HTTP server is alive (no TWAIN needed).
function isDWTAlive(timeoutMs = 3000): Promise<boolean> {
  const body = Buffer.from(
    JSON.stringify({ id: 'hc', cmdId: 'hc', method: 'VersionInfo', version: 'dwt_19301028' }),
    'utf8',
  );
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: DWT_HOST,
        port: DWT_PORT,
        path: `/fa/VersionInfo?v=1&ts=${Date.now()}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
    req.write(body);
    req.end();
  });
}

// Sends the DCP Reboot command via port 18625, then waits for the service to come back up.
async function rebootDWT(): Promise<void> {
  const body = Buffer.from(
    JSON.stringify({ id: 'reboot', method: 'Reboot', parameter: [], version: DWT_DCP_VERSION }),
    'utf8',
  );
  await new Promise<void>((resolve) => {
    const req = http.request(
      {
        hostname: DWT_HOST,
        port: DWT_DCP_PORT,
        path: `/dcp/${DWT_DCP_VERSION}/admin`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
      },
      (res) => {
        res.resume();
        resolve();
      },
    );
    req.setTimeout(5000, () => {
      req.destroy();
      resolve();
    });
    req.on('error', () => resolve());
    req.write(body);
    req.end();
  });

  // Wait for service to restart, then poll until alive
  await new Promise((r) => setTimeout(r, 5000));
  for (let i = 0; i < 15; i++) {
    if (await isDWTAlive(3000)) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TWAIN scanning via DWT local service REST API
// ─────────────────────────────────────────────────────────────────────────────

const scanWithDWT = async (
  outputPath: string,
  options: ScanOptions,
): Promise<{ success: boolean; error?: string }> => {
  const tryGetScanners = async (timeoutMs: number) =>
    dwtRequest('GET', '/DWTAPI/Scanners', undefined, timeoutMs);

  let scannersResp!: { status: number; data: Buffer };
  try {
    // 1. List available TWAIN scanners (short timeout to detect hang fast)
    scannersResp = await tryGetScanners(8000);
  } catch (err) {
    // TWAIN enumeration hung — check if DWT HTTP server is alive and reboot if so
    logger.warn('DWT scanner list timed out, checking for TWAIN hang...');
    const alive = await isDWTAlive();
    if (alive) {
      logger.info('DWT TWAIN hang detected, rebooting service and retrying...');
      await rebootDWT();
      try {
        scannersResp = await tryGetScanners(15000);
      } catch {
        return {
          success: false,
          error: 'DWT TWAIN enumeration hung after reboot. Check scanner drivers.',
        };
      }
    } else {
      return {
        success: false,
        error: 'DWT service is not responding. Ensure Dynamsoft Web TWAIN Service is running.',
      };
    }
  }

  try {
    if (scannersResp.status !== 200) {
      return {
        success: false,
        error: `DWT service unavailable (HTTP ${scannersResp.status}). Ensure Dynamsoft Web TWAIN Service is running.`,
      };
    }

    let scanners: Array<{ name: string; device: string; type?: number }>;
    try {
      scanners = JSON.parse(scannersResp.data.toString('utf8'));
    } catch {
      return { success: false, error: 'DWT returned an invalid scanner list.' };
    }
    if (!Array.isArray(scanners) || scanners.length === 0) {
      return {
        success: false,
        error:
          'No TWAIN scanners found. Ensure scanner is connected and TWAIN driver is installed.',
      };
    }

    logger.info('DWT scanners available', { scanners: scanners.map((s) => s.name) });

    // Prefer USB-connected Brother/MFC scanner; avoid LAN driver
    const scanner =
      scanners.find((s) => /brother|mfc/i.test(s.name) && /usb/i.test(s.name)) ??
      scanners.find((s) => /brother|mfc/i.test(s.name) && !/lan/i.test(s.name)) ??
      scanners.find((s) => /brother|mfc/i.test(s.name)) ??
      scanners[0];
    logger.info('DWT selected TWAIN scanner', { scanner: scanner.name });

    // 2. Map color mode — DWT PixelType: 0=BW, 1=Gray, 2=Color
    const pixelType = options.colorMode === 'bw' ? 0 : 2;

    // 3. Create scan job
    // XferCount:1  — scan exactly one page, then close the TWAIN source.
    // IfFeederEnabled:true — force ADF; without it, some Brother TWAIN drivers
    //   default to flatbed and NextDocument hangs forever if the flatbed is empty.
    const jobBody = {
      license: DWT_LICENSE,
      device: scanner.device,
      config: {
        IfShowUI: false,
        PixelType: pixelType,
        Resolution: options.dpi ?? 300,
        XferCount: 1,
        IfFeederEnabled: true,
        IfAutoFeed: true,
        IfDuplexEnabled: !!options.duplex,
      },
    };

    const jobResp = await createScanJobWithRetry(jobBody, 60000);
    if (jobResp.status !== 201) {
      const detail = jobResp.data.toString('utf8').trim();
      logger.error('DWT createJob failed', {
        status: jobResp.status,
        detail,
        scanner: scanner.name,
      });
      return {
        success: false,
        error: `DWT createJob failed (HTTP ${jobResp.status}): ${detail}`,
      };
    }

    const jobId = jobResp.data.toString('utf8').replace(/^"|"$/g, '').trim();
    logger.info('DWT scan job created', { jobId });

    // 4. Poll for the scanned image
    //    202 = still scanning, 200 = image ready, 410 = job done / no image
    //    30 s per request: ADF feed + scan can take 15-25 s on a Brother MFC
    let imageData: Buffer | null = null;
    const maxAttempts = 60; // 60 × 2 s = 2 min max
    for (let i = 0; i < maxAttempts; i++) {
      const imgResp = await dwtRequest(
        'GET',
        `/DWTAPI/ScanJobs/${jobId}/NextDocument`,
        undefined,
        30000,
      );
      if (imgResp.status === 200) {
        imageData = imgResp.data;
        break;
      } else if (imgResp.status === 202) {
        await new Promise((r) => setTimeout(r, 2000));
      } else if (imgResp.status === 410) {
        break;
      } else {
        dwtRequest('DELETE', `/DWTAPI/ScanJobs/${jobId}`).catch(() => undefined);
        return {
          success: false,
          error: `DWT NextDocument returned unexpected status ${imgResp.status}`,
        };
      }
    }

    // 5. Cleanup job — await so the TWAIN source fully closes before the next scan starts.
    //    Fire-and-forget here left DWT in a mid-cleanup state when scan 2 arrived immediately.
    await dwtRequest('DELETE', `/DWTAPI/ScanJobs/${jobId}`).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 500));

    if (!imageData || imageData.length < 1024) {
      return {
        success: false,
        error: 'DWT scan produced no image. Check that documents are loaded in the ADF.',
      };
    }

    fs.writeFileSync(outputPath, imageData);
    logger.info('DWT scan image saved', { outputPath, bytes: imageData.length });
    return { success: true };
  } catch (err) {
    return { success: false, error: `DWT scan error: ${String(err)}` };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Paper size map — PDF points [width, height]
// ─────────────────────────────────────────────────────────────────────────────

const PAPER_SIZES: Record<string, [number, number]> = {
  A4: [595.28, 841.89],
  Letter: [612, 792],
  Folio: [612, 936], // 8.5 × 13 in
  Legal: [612, 1008], // 8.5 × 14 in
};

// ─────────────────────────────────────────────────────────────────────────────
// Convert scanned JPG to PDF — scales image to fit the target paper size.
// The image is scaled proportionally to fill the paper width; any vertical
// remainder is left white (standard "fit to page" behaviour).
// ─────────────────────────────────────────────────────────────────────────────

const convertImageToPdf = async (
  imagePath: string,
  pdfPath: string,
  targetPaperSize = 'A4',
): Promise<{ success: boolean; error?: string }> => {
  try {
    const PDFDocument = require('pdfkit');

    const dims = PAPER_SIZES[targetPaperSize] ?? PAPER_SIZES['A4'];
    const [paperW, paperH] = dims;

    const doc = new PDFDocument({ size: [paperW, paperH], margin: 0 });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    const imageBuffer = fs.readFileSync(imagePath);

    // fit: scale to fill the target paper while preserving aspect ratio.
    // The image is centered; short documents get white margins on the long axis.
    doc.image(imageBuffer, 0, 0, {
      fit: [paperW, paperH],
      align: 'center',
      valign: 'center',
    });

    doc.end();

    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Convert one or two scanned images into a single PDF, for duplex printing.
//
// Photocopying otherwise prints every scanned page as its own single-page
// PDF / print job (see the loops in executePhotocopySession and
// photocopyDocument) — fine for simplex, but hardware duplex needs page N
// and N+1 to arrive as pages 1-2 of the SAME print job so the printer's
// duplexer flips the physical sheet between them instead of ejecting it and
// starting a fresh one. [frontImagePath] becomes page 1 (the sheet's front),
// [backImagePath] becomes page 2 (its back) — pass null for a trailing odd
// page that has no back side, which prints this as a normal 1-page
// (simplex) job.
// ─────────────────────────────────────────────────────────────────────────────

const convertImagePairToPdf = async (
  frontImagePath: string,
  backImagePath: string | null,
  pdfPath: string,
  targetPaperSize = 'A4',
): Promise<{ success: boolean; error?: string }> => {
  try {
    const PDFDocument = require('pdfkit');

    const dims = PAPER_SIZES[targetPaperSize] ?? PAPER_SIZES['A4'];
    const [paperW, paperH] = dims;

    const doc = new PDFDocument({ size: [paperW, paperH], margin: 0, autoFirstPage: false });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    const addImagePage = (imagePath: string) => {
      doc.addPage({ size: [paperW, paperH], margin: 0 });
      const imageBuffer = fs.readFileSync(imagePath);
      doc.image(imageBuffer, 0, 0, { fit: [paperW, paperH], align: 'center', valign: 'center' });
    };

    addImagePage(frontImagePath);
    if (backImagePath) addImagePage(backImagePath);

    doc.end();

    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Scan ALL pages from the ADF until it is empty.
// Returns an ordered list of temp-file paths (one per page).
// ─────────────────────────────────────────────────────────────────────────────

const scanAllADFPagesUnlocked = async (
  options: ScanOptions,
): Promise<{ success: boolean; pages: string[]; sessionId: string; error?: string }> => {
  const sessionId = `SESSION-${Date.now()}`;
  const pages: string[] = [];

  // ── Get scanner list (with same DWT hang-recovery as scanWithDWT) ──────────
  let scannersResp!: { status: number; data: Buffer };
  try {
    scannersResp = await dwtRequest('GET', '/DWTAPI/Scanners', undefined, 8000);
  } catch {
    logger.warn('DWT scanner list timed out during photocopy prepare, checking…');
    const alive = await isDWTAlive();
    if (alive) {
      logger.info('DWT TWAIN hang — rebooting and retrying');
      await rebootDWT();
      try {
        scannersResp = await dwtRequest('GET', '/DWTAPI/Scanners', undefined, 15000);
      } catch {
        return { success: false, pages, sessionId, error: 'DWT TWAIN hung after reboot.' };
      }
    } else {
      return { success: false, pages, sessionId, error: 'DWT service not responding.' };
    }
  }

  if (scannersResp.status !== 200) {
    return {
      success: false,
      pages,
      sessionId,
      error: `DWT unavailable (HTTP ${scannersResp.status})`,
    };
  }

  let scanners: Array<{ name: string; device: string }>;
  try {
    scanners = JSON.parse(scannersResp.data.toString('utf8'));
  } catch {
    return { success: false, pages, sessionId, error: 'DWT returned an invalid scanner list.' };
  }
  if (!Array.isArray(scanners) || scanners.length === 0) {
    return { success: false, pages, sessionId, error: 'No TWAIN scanners found.' };
  }

  const scanner =
    scanners.find((s) => /brother|mfc/i.test(s.name) && /usb/i.test(s.name)) ??
    scanners.find((s) => /brother|mfc/i.test(s.name) && !/lan/i.test(s.name)) ??
    scanners.find((s) => /brother|mfc/i.test(s.name)) ??
    scanners[0];

  // ── Create scan job — XferCount:-1 tells TWAIN to feed all ADF pages ───────
  const jobBody = {
    license: DWT_LICENSE,
    device: scanner.device,
    config: {
      IfShowUI: false,
      PixelType: options.colorMode === 'bw' ? 0 : 2,
      Resolution: options.dpi ?? 300,
      XferCount: -1, // scan every page until ADF is empty
      IfFeederEnabled: true,
      IfAutoFeed: true,
      IfDuplexEnabled: !!options.duplex,
    },
  };

  const jobResp = await createScanJobWithRetry(jobBody, 60000);
  if (jobResp.status !== 201) {
    const detail = jobResp.data.toString('utf8').trim();
    return {
      success: false,
      pages,
      sessionId,
      error: `createJob failed (HTTP ${jobResp.status}): ${detail}`,
    };
  }

  const jobId = jobResp.data.toString('utf8').replace(/^"|"$/g, '').trim();
  logger.info('Multi-page ADF scan job created', { jobId, sessionId });

  // ── Poll NextDocument until ADF is empty (410) ────────────────────────────
  const maxPages = 100;
  const maxWaitMs = 7 * 60 * 1000; // 7 minutes absolute ceiling
  const startMs = Date.now();

  while (pages.length < maxPages && Date.now() - startMs < maxWaitMs) {
    const imgResp = await dwtRequest(
      'GET',
      `/DWTAPI/ScanJobs/${jobId}/NextDocument`,
      undefined,
      30000,
    );

    if (imgResp.status === 200) {
      const pagePath = path.join(os.tmpdir(), `${sessionId}_p${pages.length}.jpg`);
      fs.writeFileSync(pagePath, imgResp.data);
      pages.push(pagePath);
      logger.info('ADF page received', {
        sessionId,
        page: pages.length,
        bytes: imgResp.data.length,
      });
    } else if (imgResp.status === 202) {
      await new Promise((r) => setTimeout(r, 2000)); // still scanning
    } else if (imgResp.status === 410) {
      break; // ADF empty — all done
    } else {
      logger.warn('Unexpected NextDocument status', { status: imgResp.status, sessionId });
      break;
    }
  }

  // ── Clean up scan job ─────────────────────────────────────────────────────
  await dwtRequest('DELETE', `/DWTAPI/ScanJobs/${jobId}`).catch(() => undefined);
  await new Promise((r) => setTimeout(r, 500));

  if (pages.length === 0) {
    return {
      success: false,
      pages,
      sessionId,
      error: 'No pages scanned. Ensure documents are loaded in the ADF.',
    };
  }

  logger.info('Multi-page ADF scan complete', { sessionId, pageCount: pages.length });
  return { success: true, pages, sessionId };
};

const scanAllADFPages = async (
  options: ScanOptions,
): Promise<{ success: boolean; pages: string[]; sessionId: string; error?: string }> =>
  scannerLock.runExclusive(() => scanAllADFPagesUnlocked(options));

// ─────────────────────────────────────────────────────────────────────────────
// Public: scan ALL pages from the ADF and return image buffers.
// Used by the "Scan to PC" document scanning workflow.
// ─────────────────────────────────────────────────────────────────────────────

export const scanAllPages = async (
  options: Partial<ScanOptions> = {},
): Promise<{ success: boolean; pages: Buffer[]; error?: string }> => {
  if (os.platform() !== 'win32') {
    return { success: false, pages: [], error: 'Scanning is only supported on Windows.' };
  }

  const result = await scanAllADFPages({
    colorMode: options.colorMode ?? 'color',
    dpi: options.dpi ?? 300,
    outputFormat: 'jpg',
    duplex: options.duplex,
  });

  if (!result.success) {
    return { success: false, pages: [], error: result.error };
  }

  const pageBuffers: Buffer[] = [];
  for (const pagePath of result.pages) {
    try {
      pageBuffers.push(fs.readFileSync(pagePath));
      fs.unlinkSync(pagePath);
    } catch {
      /* best-effort */
    }
  }

  return { success: true, pages: pageBuffers };
};

// ─────────────────────────────────────────────────────────────────────────────
// Public: scan one page via TWAIN
// ─────────────────────────────────────────────────────────────────────────────

export const scanDocument = async (options: Partial<ScanOptions> = {}): Promise<ScanResult> => {
  const scanId = `SCAN-${Date.now()}`;

  if (os.platform() !== 'win32') {
    return { success: false, error: 'Scanning is only supported on Windows.' };
  }

  const opts: ScanOptions = {
    colorMode: options.colorMode ?? 'color',
    dpi: options.dpi ?? 300,
    paperSize: options.paperSize ?? 'A4',
    outputFormat: options.outputFormat ?? 'jpg',
  };

  logger.info('Scan document request', { scanId, opts });

  const tempDir = os.tmpdir();
  const tempImage = path.join(tempDir, `scan_${scanId}.jpg`);
  const finalPath = path.join(tempDir, `scan_${scanId}.${opts.outputFormat}`);

  try {
    const result = await scannerLock.runExclusive(() => scanWithDWT(tempImage, opts));
    if (!result.success) {
      return { success: false, error: result.error };
    }

    if (opts.outputFormat === 'pdf') {
      const convertResult = await convertImageToPdf(tempImage, finalPath);
      if (!convertResult.success) {
        // Return raw JPG as fallback
        return { success: true, filePath: tempImage, method: 'twain-jpg' };
      }
    } else {
      fs.copyFileSync(tempImage, finalPath);
    }

    logger.info('Document scanned successfully via TWAIN', { scanId, filePath: finalPath });
    return { success: true, filePath: finalPath, method: 'twain' };
  } catch (error) {
    logger.error('Scan error', { scanId, error: (error as Error).message });
    return { success: false, error: (error as Error).message };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Public: ADF / scanner availability check via DWT
// ─────────────────────────────────────────────────────────────────────────────

export const checkADFStatus = async (): Promise<ADFStatus> => {
  try {
    const resp = await dwtRequest('GET', '/DWTAPI/Scanners', undefined, 5000);
    if (resp.status !== 200) {
      return {
        ready: false,
        status: 'DWT service not responding. Please ensure Dynamsoft Web TWAIN Service is running.',
      };
    }

    let scanners: Array<{ name: string }>;
    try {
      scanners = JSON.parse(resp.data.toString('utf8'));
    } catch {
      return { ready: false, status: 'DWT returned an invalid scanner list.' };
    }

    if (!Array.isArray(scanners) || scanners.length === 0) {
      return {
        ready: false,
        status: 'No TWAIN scanners detected. Ensure scanner is on and TWAIN driver is installed.',
      };
    }

    const scanner = scanners.find((s) => /brother|mfc/i.test(s.name)) ?? scanners[0];
    logger.info('ADF status check: scanner found', { scanner: scanner.name });

    // This printer's WIA driver (network/WSD) only exposes static capability
    // flags via property 3087, not a live paper-in-feeder sensor — confirmed
    // by reading it with paper both present and absent and getting the same
    // value either way. So there's no reliable way to know paper is loaded
    // before scanning; report ready once the scanner itself is reachable and
    // let the actual scan job (scanWithDWT) surface a clear error if the
    // feeder turns out to be empty.
    return {
      ready: true,
      scannerConnected: true,
      adfLoaded: true,
      status: `OKAY — ${scanner.name} connected`,
    };
  } catch (err) {
    logger.error('ADF status check error', { error: String(err) });
    return {
      ready: false,
      scannerConnected: false,
      adfLoaded: false,
      status: 'Scanner bridge is not running. Start Dynamsoft Web TWAIN Service.',
      error: String(err),
    };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Public: photocopy (scan + print N copies)
// ─────────────────────────────────────────────────────────────────────────────

export const photocopyDocument = async (
  options: Partial<CopyOptions> = {},
): Promise<CopyResult> => {
  const copyId = `COPY-${Date.now()}`;

  if (os.platform() !== 'win32') {
    return { success: false, error: 'Photocopying is only supported on Windows.' };
  }

  const opts: CopyOptions = {
    copies: options.copies ?? 1,
    colorMode: options.colorMode ?? 'bw',
    paperSize: options.paperSize ?? 'A4',
    quality: options.quality ?? 'standard',
    duplex: options.duplex ?? false,
  };

  logger.info('Photocopy request', { copyId, opts });

  try {
    const dpi = opts.quality === 'high' ? 600 : opts.quality === 'draft' ? 150 : 300;

    // Scan every page in the ADF in one job
    const scanResult = await scanAllADFPages({
      colorMode: opts.colorMode,
      dpi,
      outputFormat: 'jpg',
      duplex: opts.duplex,
    });

    if (!scanResult.success) {
      return { success: false, error: scanResult.error };
    }

    logger.info('All ADF pages scanned', { copyId, pages: scanResult.pages.length });

    const { printPdfFile, prepareWindowsPrinterDriverState, restoreWindowsPrinterDriverState, isDuplexCapablePaperSize } =
      await import('./print.service');
    const wantDuplex = !!opts.duplex && isDuplexCapablePaperSize(opts.paperSize);
    if (opts.duplex && !wantDuplex) {
      logger.warn('Photocopy duplex requested on a paper size the printer cannot duplex — printing simplex', {
        copyId,
        paperSize: opts.paperSize,
      });
    }

    // Configure the driver once for the whole job, not once per page — see
    // prepareWindowsPrinterDriverState.
    const driverState = prepareWindowsPrinterDriverState(opts.colorMode, opts.quality);
    try {
      // Print collated: one full set per copy
      for (let copy = 1; copy <= (opts.copies ?? 1); copy++) {
        if (wantDuplex) {
          // Pair consecutive pages into one 2-page PDF per physical sheet —
          // see the identical logic (and its comment) in
          // executePhotocopySession.
          for (let pi = 0; pi < scanResult.pages.length; pi += 2) {
            const frontIndex = pi;
            const backIndex = pi + 1 < scanResult.pages.length ? pi + 1 : null;
            const pairLabel = backIndex !== null ? `${frontIndex + 1}-${backIndex + 1}` : `${frontIndex + 1}`;
            const pdfPath = scanResult.pages[frontIndex].replace('.jpg', `_${copyId}_c${copy}_pair.pdf`);

            const cv = await convertImagePairToPdf(
              scanResult.pages[frontIndex],
              backIndex !== null ? scanResult.pages[backIndex] : null,
              pdfPath,
              opts.paperSize,
            );
            if (!cv.success) throw new Error(`Pages ${pairLabel} PDF conversion: ${cv.error}`);

            const pr = await printPdfFile(
              pdfPath,
              `${copyId}_p${pairLabel}_c${copy}`,
              opts.paperSize,
              opts.colorMode,
              opts.quality,
              undefined,
              driverState,
              backIndex !== null,
            );

            try {
              fs.unlinkSync(pdfPath);
            } catch {
              /* best-effort */
            }

            if (!pr.success) throw new Error(`Print pages ${pairLabel} copy ${copy}: ${pr.error}`);
          }
        } else {
          for (let pi = 0; pi < scanResult.pages.length; pi++) {
            const pdfPath = scanResult.pages[pi].replace('.jpg', `_${copyId}_c${copy}.pdf`);

            const cv = await convertImageToPdf(scanResult.pages[pi], pdfPath, opts.paperSize);
            if (!cv.success) throw new Error(`Page ${pi + 1} PDF conversion: ${cv.error}`);

            const pr = await printPdfFile(
              pdfPath,
              `${copyId}_p${pi + 1}_c${copy}`,
              opts.paperSize,
              opts.colorMode,
              opts.quality,
              undefined,
              driverState,
            );

            try {
              fs.unlinkSync(pdfPath);
            } catch {
              /* best-effort */
            }

            if (!pr.success) throw new Error(`Print page ${pi + 1} copy ${copy}: ${pr.error}`);
          }
        }
      }
    } finally {
      restoreWindowsPrinterDriverState(driverState);
    }

    // Clean up session scan files
    for (const p of scanResult.pages) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* best-effort */
      }
    }

    logger.info('Photocopy job completed', {
      copyId,
      pages: scanResult.pages.length,
      copies: opts.copies,
    });
    return { success: true, jobId: copyId };
  } catch (error) {
    logger.error('Photocopy error', { copyId, error: (error as Error).message });
    return { success: false, error: (error as Error).message };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Public: Phase 1 — scan all ADF pages and store as a session on disk.
// Call this BEFORE the payment screen.  Returns sessionId + pageCount.
// ─────────────────────────────────────────────────────────────────────────────

export const createPhotocopySession = async (options: {
  colorMode?: 'color' | 'bw';
  quality?: string;
  /** Scan both sides of each original — independent of whether the PRINT
   * side duplexes (see executePhotocopySession's own `duplex`), since the
   * scanner has no long-paper restriction the printer has. */
  duplex?: boolean;
}): Promise<{ success: boolean; sessionId?: string; pageCount?: number; error?: string }> => {
  const dpi = options.quality === 'high' ? 600 : options.quality === 'draft' ? 150 : 300;

  const result = await scanAllADFPages({
    colorMode: options.colorMode ?? 'color',
    dpi,
    outputFormat: 'jpg',
    duplex: options.duplex,
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return { success: true, sessionId: result.sessionId, pageCount: result.pages.length };
};

// ─────────────────────────────────────────────────────────────────────────────
// Public: Phase 2 — print from a previously created session.
// Call this AFTER payment succeeds.
// Each page is resized to fit the chosen paper before printing.
// ─────────────────────────────────────────────────────────────────────────────

export const executePhotocopySession = async (options: {
  sessionId: string;
  copies: number;
  paperSize: string;
  colorMode: string;
  quality: string;
  duplex?: boolean;
}): Promise<{ success: boolean; jobId?: string; pageCount?: number; error?: string }> => {
  const { sessionId, copies, paperSize, colorMode, quality, duplex } = options;
  const jobId = `COPY-${Date.now()}`;

  // Collect session page paths  (SESSION-xxx_p0.jpg, _p1.jpg, …)
  const pages: string[] = [];
  for (let i = 0; ; i++) {
    const p = path.join(os.tmpdir(), `${sessionId}_p${i}.jpg`);
    if (!fs.existsSync(p)) break;
    pages.push(p);
  }

  if (pages.length === 0) {
    return { success: false, error: `Session "${sessionId}" not found or already consumed.` };
  }

  logger.info('Executing photocopy session', {
    jobId,
    sessionId,
    pages: pages.length,
    copies,
    paperSize,
    colorMode,
    quality,
  });

  // Folio ("long" paper) jams the printer's duplexer — same rule as regular
  // printing (see isDuplexCapablePaperSize). Silently falls back to simplex
  // rather than failing the job outright.
  const { printPdfFile, prepareWindowsPrinterDriverState, restoreWindowsPrinterDriverState, isDuplexCapablePaperSize } =
    await import('./print.service');
  const wantDuplex = !!duplex && isDuplexCapablePaperSize(paperSize);
  if (duplex && !wantDuplex) {
    logger.warn('Photocopy duplex requested on a paper size the printer cannot duplex — printing simplex', {
      jobId,
      paperSize,
    });
  }

  try {
    // Color/quality are the SAME for every page and copy in this job, so
    // configure the driver ONCE instead of once per page — see
    // prepareWindowsPrinterDriverState for why that matters (each
    // configuration step is a blocking PowerShell round-trip; doing it per
    // page stalled the whole backend for seconds on multi-page/multi-copy jobs).
    const driverState = prepareWindowsPrinterDriverState(colorMode, quality);
    try {
      // Print collated: one full set of pages per copy.
      for (let copy = 1; copy <= copies; copy++) {
        if (wantDuplex) {
          // Pair consecutive pages (front, back) into ONE 2-page PDF so the
          // printer's duplexer flips the same physical sheet between them —
          // printing them as separate single-page jobs (the simplex path
          // below) would put each on its own sheet regardless of any
          // duplex flag. A trailing odd page has no back side and prints
          // alone (simplex).
          for (let pi = 0; pi < pages.length; pi += 2) {
            const frontIndex = pi;
            const backIndex = pi + 1 < pages.length ? pi + 1 : null;
            const pairLabel = backIndex !== null ? `${frontIndex + 1}-${backIndex + 1}` : `${frontIndex + 1}`;
            const pdfPath = pages[frontIndex].replace('.jpg', `_${jobId}_c${copy}_pair.pdf`);

            const cv = await convertImagePairToPdf(
              pages[frontIndex],
              backIndex !== null ? pages[backIndex] : null,
              pdfPath,
              paperSize,
            );
            if (!cv.success) throw new Error(`Pages ${pairLabel} PDF conversion: ${cv.error}`);

            const pr = await printPdfFile(
              pdfPath,
              `${jobId}_p${pairLabel}_c${copy}`,
              paperSize,
              colorMode,
              quality,
              undefined,
              driverState,
              backIndex !== null, // only a real pair gets duplex — a solo trailing page is simplex
            );

            try {
              fs.unlinkSync(pdfPath);
            } catch {
              /* best-effort */
            }

            if (!pr.success) throw new Error(`Print pages ${pairLabel} copy ${copy}: ${pr.error}`);
          }
        } else {
          for (let pi = 0; pi < pages.length; pi++) {
            const pdfPath = pages[pi].replace('.jpg', `_${jobId}_c${copy}.pdf`);

            const cv = await convertImageToPdf(pages[pi], pdfPath, paperSize);
            if (!cv.success) throw new Error(`Page ${pi + 1} PDF conversion: ${cv.error}`);

            const pr = await printPdfFile(
              pdfPath,
              `${jobId}_p${pi + 1}_c${copy}`,
              paperSize,
              colorMode,
              quality,
              undefined,
              driverState,
            );

            try {
              fs.unlinkSync(pdfPath);
            } catch {
              /* best-effort */
            }

            if (!pr.success) throw new Error(`Print page ${pi + 1} copy ${copy}: ${pr.error}`);
          }
        }
      }
    } finally {
      restoreWindowsPrinterDriverState(driverState);
    }

    // Clean up session scan files
    for (const p of pages) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* best-effort */
      }
    }

    logger.info('Photocopy session executed', { jobId, pages: pages.length, copies });
    return { success: true, jobId, pageCount: pages.length };
  } catch (error) {
    logger.error('executePhotocopySession error', { jobId, error: (error as Error).message });
    return { success: false, error: (error as Error).message };
  }
};
