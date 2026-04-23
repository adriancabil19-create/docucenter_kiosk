import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { transferStore } from '../services/transfer.service';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

interface UploadedFile {
  originalname: string;
  path: string;
  mimetype: string;
}

const router = Router();

const uploadDir = path.join(os.tmpdir(), 'docucenter_transfer');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, `${uuidv4()}_${file.originalname}`),
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
});

/**
 * POST /api/transfer/upload
 * Kiosk uploads files — returns a session download URL for the QR code.
 */
router.post('/api/transfer/upload', upload.array('files', 20), (req: Request, res: Response): void => {
  const files = (req.files ?? []) as UploadedFile[];

  if (!files || files.length === 0) {
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

export default router;
