 import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { transferStore } from '../services/transfer.service';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { convertToPdf } from '../services/pdf-converter.service';

interface DiskFile {
  originalname: string;
  path: string;
  mimetype: string;
}

interface MemFile {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
}

const router = Router();

const CONVERTIBLE_EXTS = new Set(['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp']);

/**
 * Convert a memory-buffer file to PDF if it's a convertible document type.
 * Returns the original file unchanged if conversion is not needed or fails.
 */
function maybeConvertToPdf(file: MemFile): MemFile {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!CONVERTIBLE_EXTS.has(ext)) return file;

  const tmpInput = path.join(os.tmpdir(), `${uuidv4()}${ext}`);
  const tmpDir = os.tmpdir();
  try {
    fs.writeFileSync(tmpInput, file.buffer);
    const pdfPath = convertToPdf(tmpInput, tmpDir, file.originalname);
    const pdfBuffer = fs.readFileSync(pdfPath);
    const newName = `${path.parse(file.originalname).name}.pdf`;
    logger.info('Converted uploaded file to PDF', { original: file.originalname, pdf: newName });
    // clean up temp files
    try { fs.unlinkSync(tmpInput); } catch { /* ignore */ }
    if (pdfPath !== tmpInput) try { fs.unlinkSync(pdfPath); } catch { /* ignore */ }
    return { originalname: newName, buffer: pdfBuffer, mimetype: 'application/pdf' };
  } catch (err) {
    logger.warn('PDF conversion failed for uploaded file, keeping original', {
      file: file.originalname,
      error: String(err),
    });
    try { fs.unlinkSync(tmpInput); } catch { /* ignore */ }
    return file;
  }
}

// Kiosk → phone: disk storage (files can be large)
const uploadDir = path.join(os.tmpdir(), 'docucenter_transfer');
fs.mkdirSync(uploadDir, { recursive: true });

const diskUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, `${uuidv4()}_${file.originalname}`),
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
});

// Phone → kiosk: memory storage (avoids disk I/O issues on Render)
const memUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

/**
 * POST /api/transfer/upload
 * Kiosk uploads files — returns a session download URL for the QR code.
 */
router.post('/api/transfer/upload', diskUpload.array('files', 20), (req: Request, res: Response): void => {
  const files = (req.files ?? []) as DiskFile[];

  if (files.length === 0) {
    res.status(400).json({ success: false, error: 'No files uploaded' });
    return;
  }

  const session = transferStore.create(
    files.map((f) => ({ name: f.originalname, path: f.path, mimeType: f.mimetype })),
  );

  const downloadUrl = `${config.apiBaseUrl}/transfer/${session.id}`;

  logger.info('Transfer session created', {
    sessionId: session.id,
    fileCount: files.length,
    expiresAt: session.expiresAt,
  });

  res.json({
    success: true,
    sessionId: session.id,
    downloadUrl,
    expiresAt: session.expiresAt.toISOString(),
    fileCount: files.length,
  });
});

/**
 * GET /transfer/:sessionId
 * Phone-friendly HTML download page.
 */
router.get('/transfer/:sessionId', (req: Request, res: Response): void => {
  const session = transferStore.get(req.params.sessionId);

  if (!session) {
    res.status(404).send('<h1 style="font-family:sans-serif;text-align:center;margin-top:60px">Session expired or not found.</h1>');
    return;
  }

  const items = session.files
    .map((f) => {
      const enc = encodeURIComponent(f.name);
      return `<li><a href="/transfer/${session.id}/file/${enc}">${f.name}</a></li>`;
    })
    .join('\n    ');

  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>DocuCenter — File Transfer</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;max-width:560px;margin:40px auto;padding:20px;background:#f8fafc}
    h1{color:#2563EB;margin-bottom:4px}
    p{color:#555;margin-top:0}
    ul{list-style:none;padding:0}
    li{margin:10px 0}
    a{display:block;padding:14px 20px;background:#2563EB;color:#fff;text-decoration:none;
       border-radius:10px;font-size:15px;word-break:break-all}
    a:hover{background:#1d4ed8}
    .exp{font-size:12px;color:#999;margin-top:24px}
  </style>
</head>
<body>
  <h1>DocuCenter</h1>
  <p>Tap a file below to download it to your device.</p>
  <ul>
    ${items}
  </ul>
  <p class="exp">Link expires at ${session.expiresAt.toLocaleTimeString()}</p>
</body>
</html>`);
});

/**
 * GET /transfer/:sessionId/file/:filename
 * Streams a single file to the phone.
 */
router.get('/transfer/:sessionId/file/:filename', (req: Request, res: Response): void => {
  const session = transferStore.get(req.params.sessionId);

  if (!session) {
    res.status(404).json({ error: 'Session expired or not found' });
    return;
  }

  const filename = decodeURIComponent(req.params.filename);
  const entry = session.files.find((f) => f.name === filename);

  if (!entry) {
    res.status(404).json({ error: 'File not found in session' });
    return;
  }

  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.setHeader('Content-Type', entry.mimeType || 'application/octet-stream');
  res.sendFile(entry.path, (err) => {
    if (err) logger.error('Transfer file send error', { filename, error: String(err) });
  });
});

// =============================================================================
// Receive routes (phone → kiosk)
// =============================================================================

/**
 * POST /api/transfer/receive-session
 * Kiosk creates a session and gets back an upload URL to show as a QR code.
 */
router.post('/api/transfer/receive-session', (_req: Request, res: Response): void => {
  const session = transferStore.createReceive();
  const uploadUrl = `${config.apiBaseUrl}/transfer/receive/${session.id}`;

  logger.info('Receive session created', { sessionId: session.id });

  res.json({
    success: true,
    sessionId: session.id,
    uploadUrl,
    expiresAt: session.expiresAt.toISOString(),
  });
});

/**
 * GET /transfer/receive/:sessionId
 * Phone-friendly HTML upload form — plain HTML, no inline JS (avoids CSP issues).
 */
router.get('/transfer/receive/:sessionId', (req: Request, res: Response): void => {
  const session = transferStore.getReceive(req.params.sessionId);

  if (!session) {
    res.status(404).send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DocuCenter</title>
<style>body{font-family:Arial,sans-serif;text-align:center;margin-top:80px;background:#f8fafc;color:#374151}</style>
</head><body><h2>Session expired or not found.</h2><p>Please scan the QR code again at the kiosk.</p></body></html>`);
    return;
  }

  if (session.ready) {
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DocuCenter — Sent!</title>
<style>body{font-family:Arial,sans-serif;text-align:center;margin-top:80px;background:#f8fafc}
h1{color:#16a34a}p{color:#555;font-size:15px}</style>
</head><body>
<h1>&#10003; Files sent!</h1>
<p>Your files have been received by the kiosk and are ready for printing.</p>
<p style="font-size:13px;color:#999">You can close this page.</p>
</body></html>`);
    return;
  }

  const sid = req.params.sessionId;
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>DocuCenter — Send Files for Printing</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;max-width:480px;margin:40px auto;padding:20px;background:#f8fafc}
    h1{color:#2563EB;margin-bottom:4px}
    p{color:#555;margin-top:0}
    input[type=file]{width:100%;margin:16px 0;font-size:14px;padding:8px;
                     border:1px solid #d1d5db;border-radius:8px}
    button[type=submit]{width:100%;padding:14px;background:#2563EB;color:#fff;border:none;
                        border-radius:10px;font-size:16px;cursor:pointer;margin-top:8px}
    button[type=submit]:hover{background:#1d4ed8}
  </style>
</head>
<body>
  <h1>DocuCenter</h1>
  <p>Select files to send to the kiosk for printing.</p>
  <form method="POST" action="/transfer/receive/${sid}" enctype="multipart/form-data">
    <input type="file" name="files" multiple
      accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.bmp">
    <button type="submit">Send to Kiosk</button>
  </form>
</body>
</html>`);
});

/**
 * POST /transfer/receive/:sessionId
 * Phone submits files via the upload form — uses memory storage.
 */
router.post('/transfer/receive/:sessionId', memUpload.array('files', 20), (req: Request, res: Response): void => {
  try {
    const session = transferStore.getReceive(req.params.sessionId);

    if (!session) {
      res.status(404).setHeader('Content-Type', 'text/html');
      res.send('<h1 style="font-family:sans-serif;text-align:center;margin-top:60px">Session expired. Please scan the QR code again.</h1>');
      return;
    }

    const files = (req.files ?? []) as MemFile[];
    if (files.length === 0) {
      res.status(400).setHeader('Content-Type', 'text/html');
      res.send('<h1 style="font-family:sans-serif;text-align:center;margin-top:60px">No files selected. Please go back and choose files.</h1>');
      return;
    }

    const converted = files.map((f) => maybeConvertToPdf({ ...f, originalname: decodeURIComponent(f.originalname) }));
    const added = transferStore.addFilesToReceive(
      req.params.sessionId,
      converted.map((f) => ({ name: f.originalname, buffer: f.buffer, mimeType: f.mimetype })),
    );

    if (!added) {
      logger.warn('Receive session not found while storing uploaded files', {
        sessionId: req.params.sessionId,
      });
      res.status(404).setHeader('Content-Type', 'text/html');
      res.send('<h1 style="font-family:sans-serif;text-align:center;margin-top:60px">Session expired while uploading. Please scan the QR code again.</h1>');
      return;
    }

    logger.info('Files received from phone', {
      sessionId: req.params.sessionId,
      fileCount: files.length,
    });

    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DocuCenter — Sent!</title>
<style>body{font-family:Arial,sans-serif;text-align:center;margin-top:80px;background:#f8fafc}
h1{color:#16a34a}p{color:#555;font-size:15px}</style>
</head><body>
<h1>&#10003; ${files.length} file(s) sent!</h1>
<p>Your files have been received by the kiosk and are ready for printing.</p>
<p style="font-size:13px;color:#999">You can close this page.</p>
</body></html>`);
  } catch (error) {
    const err = error as Error;
    logger.error('Receive upload route error', { sessionId: req.params.sessionId, error: err.message });
    res.status(500).setHeader('Content-Type', 'text/html');
    res.send('<h1 style="font-family:sans-serif;text-align:center;margin-top:60px">Upload failed due to a server error. Please try again.</h1>');
  }
});

/**
 * GET /api/transfer/receive-session/:sessionId/status
 * Kiosk polls this to know when the phone has uploaded files.
 */
router.get('/api/transfer/receive-session/:sessionId/status', (req: Request, res: Response): void => {
  const session = transferStore.getReceive(req.params.sessionId);

  if (!session) {
    res.status(404).json({ success: false, error: 'Session expired or not found' });
    return;
  }

  res.json({
    success: true,
    ready: session.ready,
    fileCount: session.files.length,
    files: session.files.map((f) => ({ name: f.name, mimeType: f.mimeType })),
  });
});

/**
 * GET /api/transfer/receive-session/:sessionId/file/:filename
 * Kiosk downloads a specific file the phone uploaded (served from memory).
 */
router.get('/api/transfer/receive-session/:sessionId/file/:filename', (req: Request, res: Response): void => {
  const session = transferStore.getReceive(req.params.sessionId);

  if (!session) {
    res.status(404).json({ error: 'Session expired or not found' });
    return;
  }

  const filename = decodeURIComponent(req.params.filename);
  const entry = session.files.find((f) => f.name === filename);

  if (!entry) {
    res.status(404).json({ error: 'File not found in session' });
    return;
  }

  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.setHeader('Content-Type', entry.mimeType || 'application/octet-stream');
  res.send(entry.buffer);
});

/**
 * DELETE /api/transfer/receive-session/:sessionId
 * Kiosk cleans up the session after downloading all files.
 */
router.delete('/api/transfer/receive-session/:sessionId', (req: Request, res: Response): void => {
  transferStore.deleteReceive(req.params.sessionId);
  res.json({ success: true });
});

export default router;
