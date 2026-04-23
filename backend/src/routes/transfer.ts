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
 * Phone-friendly HTML upload form.
 */
router.get('/transfer/receive/:sessionId', (req: Request, res: Response): void => {
  const session = transferStore.getReceive(req.params.sessionId);

  if (!session) {
    res.status(404).send('<h1 style="font-family:sans-serif;text-align:center;margin-top:60px">Session expired or not found.</h1>');
    return;
  }

  if (session.ready) {
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>DocuCenter — Files Sent</title>
  <style>
    body{font-family:Arial,sans-serif;max-width:480px;margin:60px auto;padding:20px;
         background:#f8fafc;text-align:center}
    h1{color:#16a34a}
    p{color:#555}
  </style>
</head>
<body>
  <h1>✓ Files sent!</h1>
  <p>Your files have been received by the kiosk and are ready for printing.</p>
  <p style="font-size:13px;color:#999">You can close this page.</p>
</body>
</html>`);
    return;
  }

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
    .drop{border:2px dashed #2563EB;border-radius:12px;padding:32px 20px;text-align:center;
          color:#2563EB;cursor:pointer;margin:16px 0;background:#eff6ff}
    .drop:hover{background:#dbeafe}
    input[type=file]{display:none}
    .file-list{list-style:none;padding:0;margin:8px 0}
    .file-list li{padding:8px 12px;background:#fff;border:1px solid #e5e7eb;
                  border-radius:8px;margin:4px 0;font-size:13px;color:#374151}
    button{width:100%;padding:14px;background:#2563EB;color:#fff;border:none;
           border-radius:10px;font-size:16px;cursor:pointer;margin-top:12px}
    button:hover{background:#1d4ed8}
    button:disabled{background:#93c5fd;cursor:not-allowed}
    .status{text-align:center;margin-top:16px;font-size:14px;color:#555}
    .success{color:#16a34a;font-weight:bold}
    .error{color:#dc2626}
  </style>
</head>
<body>
  <h1>DocuCenter</h1>
  <p>Send files to the kiosk for printing.</p>

  <div class="drop" id="drop" onclick="document.getElementById('fileInput').click()">
    <div style="font-size:32px">📄</div>
    <div style="font-weight:bold;margin:8px 0">Tap to select files</div>
    <div style="font-size:12px;color:#6b7280">PDF, Word, Excel, Images supported</div>
  </div>
  <input type="file" id="fileInput" multiple
    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.bmp">

  <ul class="file-list" id="fileList"></ul>

  <button id="sendBtn" disabled onclick="sendFiles()">Send to Kiosk</button>
  <p class="status" id="status"></p>

  <script>
    const input = document.getElementById('fileInput');
    const list  = document.getElementById('fileList');
    const btn   = document.getElementById('sendBtn');
    const stat  = document.getElementById('status');

    input.addEventListener('change', () => {
      list.innerHTML = '';
      for (const f of input.files) {
        const li = document.createElement('li');
        li.textContent = f.name + ' (' + (f.size / 1024).toFixed(1) + ' KB)';
        list.appendChild(li);
      }
      btn.disabled = input.files.length === 0;
    });

    async function sendFiles() {
      if (!input.files.length) return;
      btn.disabled = true;
      stat.textContent = 'Uploading…';
      stat.className = 'status';

      const fd = new FormData();
      for (const f of input.files) fd.append('files', f);

      try {
        const res = await fetch(window.location.href, { method: 'POST', body: fd });
        if (res.ok) {
          stat.textContent = '✓ Files sent! You can close this page.';
          stat.className = 'status success';
          btn.textContent = 'Sent!';
          list.innerHTML = '';
          input.value = '';
        } else {
          throw new Error('Server error ' + res.status);
        }
      } catch (e) {
        stat.textContent = 'Failed: ' + e.message;
        stat.className = 'status error';
        btn.disabled = false;
      }
    }
  </script>
</body>
</html>`);
});

/**
 * POST /transfer/receive/:sessionId
 * Phone submits files via the upload form.
 */
router.post('/transfer/receive/:sessionId', upload.array('files', 20), (req: Request, res: Response): void => {
  const session = transferStore.getReceive(req.params.sessionId);

  if (!session) {
    res.status(404).json({ error: 'Session expired or not found' });
    return;
  }

  const files = (req.files ?? []) as UploadedFile[];
  if (files.length === 0) {
    res.status(400).json({ error: 'No files received' });
    return;
  }

  transferStore.addFilesToReceive(
    req.params.sessionId,
    files.map((f) => ({ name: f.originalname, path: f.path, mimeType: f.mimetype })),
  );

  logger.info('Files received from phone', {
    sessionId: req.params.sessionId,
    fileCount: files.length,
  });

  res.json({ success: true, fileCount: files.length });
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
 * Kiosk downloads a specific file that the phone uploaded.
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
  res.sendFile(entry.path, (err) => {
    if (err) logger.error('Receive file send error', { filename, error: String(err) });
  });
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
