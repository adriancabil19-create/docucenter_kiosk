import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────────────────────

interface ScanOptions {
  colorMode?: 'color' | 'bw';
  dpi?: number;
  paperSize?: string;
  outputFormat?: 'pdf' | 'jpg' | 'png';
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
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamsoft Web TWAIN (DWT) local service helpers
// ─────────────────────────────────────────────────────────────────────────────

const DWT_HOST = '127.0.0.1';
const DWT_PORT = 18622;
const DWT_DCP_PORT = 18625;
const DWT_DCP_VERSION = 'dwasm2_19301028';
const DWT_LICENSE =
  't0200EQYAACdTxWAVwW/IIbkLSSWSboeM7i37QH6J75HEH8pOSydAno8ilBC40qlhRTQ37w7VY63TyF81OQumTpZk/m+MRFi215UTE5wy3pnEY508wYlHTiKXPm0+bZXGxQEIwJon+16HH8A1kNdyAjZ99F4ZCgA9QDqA9NbAPaC5C5981MmLv/85vXegLScmOGW8sy6QMU6e4MQjpy+QxZLa/W73XCBc35wCQA+QJpDmZWoUCJ0B9ABpAtupilEAZLQ2zhn7AZNyN6M=';

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
      },
    };

    const jobResp = await dwtRequest('POST', '/DWTAPI/ScanJobs', jobBody, 60000);
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
// Scan ALL pages from the ADF until it is empty.
// Returns an ordered list of temp-file paths (one per page).
// ─────────────────────────────────────────────────────────────────────────────

const scanAllADFPages = async (
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
    },
  };

  const jobResp = await dwtRequest('POST', '/DWTAPI/ScanJobs', jobBody, 60000);
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
    const result = await scanWithDWT(tempImage, opts);
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
    return { ready: true, status: `OKAY — ${scanner.name} detected via TWAIN` };
  } catch (err) {
    logger.error('ADF status check error', { error: String(err) });
    return {
      ready: false,
      status: 'Please place your document on the scanner, thank you.',
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
  };

  logger.info('Photocopy request', { copyId, opts });

  try {
    const dpi = opts.quality === 'high' ? 600 : opts.quality === 'draft' ? 150 : 300;

    // Scan every page in the ADF in one job
    const scanResult = await scanAllADFPages({
      colorMode: opts.colorMode,
      dpi,
      outputFormat: 'jpg',
    });

    if (!scanResult.success) {
      return { success: false, error: scanResult.error };
    }

    logger.info('All ADF pages scanned', { copyId, pages: scanResult.pages.length });

    const { printPdfFile } = await import('./print.service');

    // Print collated: one full set per copy
    for (let copy = 1; copy <= (opts.copies ?? 1); copy++) {
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
        );

        try {
          fs.unlinkSync(pdfPath);
        } catch {
          /* best-effort */
        }

        if (!pr.success) throw new Error(`Print page ${pi + 1} copy ${copy}: ${pr.error}`);
      }
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
}): Promise<{ success: boolean; sessionId?: string; pageCount?: number; error?: string }> => {
  const dpi = options.quality === 'high' ? 600 : options.quality === 'draft' ? 150 : 300;

  const result = await scanAllADFPages({
    colorMode: options.colorMode ?? 'color',
    dpi,
    outputFormat: 'jpg',
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
}): Promise<{ success: boolean; jobId?: string; error?: string }> => {
  const { sessionId, copies, paperSize, colorMode, quality } = options;
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

  try {
    const { printPdfFile } = await import('./print.service');

    // Print collated: one full set of pages per copy.
    for (let copy = 1; copy <= copies; copy++) {
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
        );

        try {
          fs.unlinkSync(pdfPath);
        } catch {
          /* best-effort */
        }

        if (!pr.success) throw new Error(`Print page ${pi + 1} copy ${copy}: ${pr.error}`);
      }
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
    return { success: true, jobId };
  } catch (error) {
    logger.error('executePhotocopySession error', { jobId, error: (error as Error).message });
    return { success: false, error: (error as Error).message };
  }
};
