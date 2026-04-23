import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync, spawnSync } from 'child_process';
import PDFDocument from 'pdfkit';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mammoth = require('mammoth') as typeof import('mammoth');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx') as typeof import('xlsx');

// ---------------------------------------------------------------------------
// Windows Office COM automation (primary on Windows — pixel-perfect)
// ---------------------------------------------------------------------------

const OFFICE_CANDIDATES = [
  'C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE',
  'C:\\Program Files\\Microsoft Office\\root\\Office15\\WINWORD.EXE',
  'C:\\Program Files (x86)\\Microsoft Office\\root\\Office16\\WINWORD.EXE',
  'C:\\Program Files (x86)\\Microsoft Office\\Office16\\WINWORD.EXE',
  'C:\\Program Files (x86)\\Microsoft Office\\Office15\\WINWORD.EXE',
];

const isWindowsOfficeAvailable = (): boolean => {
  if (os.platform() !== 'win32') return false;
  return OFFICE_CANDIDATES.some((p) => fs.existsSync(p));
};

// In PS single-quoted strings only ' needs escaping ('' = literal quote).
// Backslashes are literal — do NOT double them.
const psEscape = (s: string) => s.replace(/'/g, "''");

const convertWithWindowsOffice = (
  inputPath: string,
  outputPath: string,
  ext: string,
): void => {
  const absIn = path.resolve(inputPath);
  const absOut = path.resolve(outputPath);

  let script: string;

  if (['.doc', '.docx', '.odt'].includes(ext)) {
    script = `
$w = New-Object -ComObject Word.Application
$w.Visible = $false; $w.DisplayAlerts = 0
try {
  $d = $w.Documents.Open('${psEscape(absIn)}', $false, $true)
  $d.SaveAs2('${psEscape(absOut)}', 17)
  $d.Close($false)
} finally { $w.Quit(); [GC]::Collect() }
`.trim();
  } else if (['.xls', '.xlsx', '.ods', '.csv'].includes(ext)) {
    script = `
$x = New-Object -ComObject Excel.Application
$x.Visible = $false; $x.DisplayAlerts = $false
try {
  $b = $x.Workbooks.Open('${psEscape(absIn)}', 0, $true)
  $b.ExportAsFixedFormat(0, '${psEscape(absOut)}')
  $b.Close($false)
} finally { $x.Quit(); [GC]::Collect() }
`.trim();
  } else if (['.ppt', '.pptx', '.odp'].includes(ext)) {
    script = `
$p = New-Object -ComObject PowerPoint.Application
try {
  $s = $p.Presentations.Open('${psEscape(absIn)}', $true, $false, $false)
  $s.SaveAs('${psEscape(absOut)}', 32)
  $s.Close()
} finally { $p.Quit(); [GC]::Collect() }
`.trim();
  } else {
    throw new Error(`No Office COM handler for extension: ${ext}`);
  }

  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { timeout: 120_000, stdio: 'pipe' },
  );

  if (!fs.existsSync(absOut)) {
    const detail = (result.stderr?.toString() || result.stdout?.toString() || '').trim().slice(0, 400);
    throw new Error(`Office COM conversion produced no output. ${detail}`);
  }
};

// ---------------------------------------------------------------------------
// LibreOffice detection + conversion (primary on Linux/Docker)
// ---------------------------------------------------------------------------

const WINDOWS_SOFFICE_PATHS = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
];

const getLibreOfficeBin = (): string | null => {
  if (os.platform() === 'win32') {
    const found = WINDOWS_SOFFICE_PATHS.find((p) => fs.existsSync(p));
    return found ?? null;
  }
  try {
    execSync('which soffice', { stdio: 'pipe' });
    return 'soffice';
  } catch {
    return null;
  }
};

export const isLibreOfficeAvailable = (): boolean => getLibreOfficeBin() !== null;

const convertWithLibreOffice = (
  soffice: string,
  inputPath: string,
  outputDir: string,
  outputPath: string,
): void => {
  const spawnEnv: NodeJS.ProcessEnv = { ...process.env };
  if (os.platform() !== 'win32') {
    const tmpHome = path.join(os.tmpdir(), `lo-home-${process.pid}`);
    fs.mkdirSync(tmpHome, { recursive: true });
    spawnEnv.HOME = tmpHome;
    spawnEnv.UserInstallation = `file://${tmpHome}`;
  }

  const result = spawnSync(
    soffice,
    ['--headless', '--convert-to', 'pdf', '--outdir', outputDir, inputPath],
    { timeout: 120_000, stdio: 'pipe', env: spawnEnv },
  );

  if (result.status !== 0) {
    const stderr = result.stderr?.toString().trim();
    throw new Error(`LibreOffice failed (exit ${result.status}): ${stderr}`);
  }

  const inputBaseName = path.parse(inputPath).name;
  const loPdfPath = path.join(outputDir, `${inputBaseName}.pdf`);
  if (loPdfPath !== outputPath && fs.existsSync(loPdfPath)) {
    fs.renameSync(loPdfPath, outputPath);
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error('LibreOffice ran but produced no PDF output');
  }
};

// ---------------------------------------------------------------------------
// Fallback: mammoth HTML + cheerio + pdfkit (DOCX only, images preserved)
// ---------------------------------------------------------------------------

function renderHtmlToPdf(doc: InstanceType<typeof PDFDocument>, html: string): void {
  const $ = cheerio.load(html);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Node = any;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  function addImage(src: string) {
    if (!src.startsWith('data:')) return;
    const [, b64] = src.split(',');
    if (!b64) return;
    try {
      const buf = Buffer.from(b64, 'base64');
      doc.image(buf, { fit: [pageWidth, 600] });
      doc.moveDown(0.5);
    } catch { /* unsupported format — skip */ }
  }

  $('body').children().each((_i, el) => {
    const tag = (el as Node).name?.toLowerCase();
    if (!tag) return;

    if (/^h[1-6]$/.test(tag)) {
      const level = parseInt(tag[1], 10);
      const size = Math.max(12, 22 - (level - 1) * 3);
      const text = $(el).text().trim();
      if (text) {
        doc.font('Helvetica-Bold').fontSize(size).text(text, { lineGap: 3 });
        doc.font('Helvetica').fontSize(11);
        doc.moveDown(0.3);
      }
      return;
    }

    if (tag === 'p') {
      const imgs = $(el).find('img');
      imgs.each((_j, img) => addImage($(img).attr('src') ?? ''));
      const text = $(el).text().trim();
      if (text) {
        doc.font('Helvetica').fontSize(11).text(text, { lineGap: 2 });
        doc.moveDown(0.2);
      } else if (!imgs.length) {
        doc.moveDown(0.1);
      }
      return;
    }

    if (tag === 'ul' || tag === 'ol') {
      $(el).find('li').each((_j, li) => {
        const text = $(li).text().trim();
        if (text) doc.font('Helvetica').fontSize(11).text(`• ${text}`, { indent: 20, lineGap: 2 });
      });
      doc.moveDown(0.3);
      return;
    }

    if (tag === 'table') {
      $(el).find('tr').each((_j, tr) => {
        const cells = $(tr).find('td, th').map((_k, td) => $(td).text().trim()).toArray();
        if (cells.length) {
          doc.font('Helvetica').fontSize(9).text(cells.join('   |   '), { lineGap: 1 });
        }
      });
      doc.moveDown(0.4);
      return;
    }

    const text = $(el).text().trim();
    if (text) {
      doc.font('Helvetica').fontSize(11).text(text, { lineGap: 2 });
      doc.moveDown(0.2);
    }
  });
}

const convertDocToPdfFallback = async (inputPath: string, outputPath: string): Promise<void> => {
  const result = await mammoth.convertToHtml(
    { path: inputPath },
    {
      convertImage: mammoth.images.imgElement(async (image: { read: (enc: string) => Promise<string>; contentType: string }) => {
        const b64 = await image.read('base64');
        return { src: `data:${image.contentType};base64,${b64}` };
      }),
    },
  );

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 72, size: 'A4' });
    const out = fs.createWriteStream(outputPath);
    doc.pipe(out);
    doc.fontSize(11).font('Helvetica');
    try {
      renderHtmlToPdf(doc, result.value);
    } catch (err) {
      logger.warn('renderHtmlToPdf partial error', { error: String(err) });
    }
    doc.end();
    out.on('finish', resolve);
    out.on('error', reject);
  });
};

const convertXlsToPdfFallback = async (inputPath: string, outputPath: string): Promise<void> => {
  const workbook = XLSX.readFile(inputPath);

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
    const out = fs.createWriteStream(outputPath);
    doc.pipe(out);

    let firstSheet = true;
    for (const sheetName of workbook.SheetNames) {
      if (!firstSheet) doc.addPage();
      firstSheet = false;
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
      doc.fontSize(13).font('Helvetica-Bold').text(sheetName).moveDown(0.4);
      doc.fontSize(8).font('Helvetica');
      for (const row of rows) {
        const line = (row as unknown[]).map((c) => String(c ?? '')).join('   ');
        doc.text(line, { lineGap: 1 });
      }
      doc.moveDown(0.5);
    }

    doc.end();
    out.on('finish', resolve);
    out.on('error', reject);
  });
};

const convertPptToPdfFallback = async (inputPath: string, outputPath: string): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 72, size: 'A4' });
    const out = fs.createWriteStream(outputPath);
    doc.pipe(out);
    doc.fontSize(12).text(
      `Presentation: ${path.basename(inputPath)}\n\nFull conversion requires Microsoft Office or LibreOffice.`,
    );
    doc.end();
    out.on('finish', resolve);
    out.on('error', reject);
  });
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const DOCX_EXTS = new Set(['.doc', '.docx', '.odt']);
const XLSX_EXTS = new Set(['.xls', '.xlsx', '.ods', '.csv']);
const PPTX_EXTS = new Set(['.ppt', '.pptx', '.odp']);
const OFFICE_EXTS = new Set([...DOCX_EXTS, ...XLSX_EXTS, ...PPTX_EXTS]);

export const convertToPdf = async (
  inputPath: string,
  outputDir: string,
  originalFileName: string,
): Promise<string> => {
  if (!fs.existsSync(inputPath)) throw new Error(`File not found: ${inputPath}`);

  const ext = path.extname(originalFileName).toLowerCase();
  const baseName = path.parse(originalFileName).name;
  const outputPath = path.join(outputDir, `${baseName}.pdf`);

  logger.info('Starting document→PDF conversion', { file: originalFileName, ext });

  if (ext === '.pdf') {
    fs.copyFileSync(inputPath, outputPath);
    return outputPath;
  }

  if (OFFICE_EXTS.has(ext)) {
    // ── 1. LibreOffice — pixel-perfect, works on Windows + Linux/Docker ───────
    const soffice = getLibreOfficeBin();
    if (soffice) {
      try {
        convertWithLibreOffice(soffice, inputPath, outputDir, outputPath);
        logger.info('Converted with LibreOffice', { outputPath });
        return outputPath;
      } catch (err) {
        logger.warn('LibreOffice conversion failed, trying Office COM', { error: String(err) });
      }
    }

    // ── 2. Windows fallback: Microsoft Office COM ─────────────────────────────
    if (isWindowsOfficeAvailable()) {
      try {
        convertWithWindowsOffice(inputPath, outputPath, ext);
        logger.info('Converted with Microsoft Office COM', { outputPath });
        return outputPath;
      } catch (err) {
        logger.warn('Office COM conversion failed, falling back to pdfkit', { error: String(err) });
      }
    }

    // ── 3. Last resort: mammoth/xlsx/pdfkit ───────────────────────────────────
    if (DOCX_EXTS.has(ext)) {
      await convertDocToPdfFallback(inputPath, outputPath);
      logger.info('DOCX converted via mammoth+pdfkit fallback', { outputPath });
      return outputPath;
    }
    if (XLSX_EXTS.has(ext)) {
      await convertXlsToPdfFallback(inputPath, outputPath);
      logger.info('XLSX converted via xlsx+pdfkit fallback', { outputPath });
      return outputPath;
    }
    if (PPTX_EXTS.has(ext)) {
      await convertPptToPdfFallback(inputPath, outputPath);
      logger.info('PPTX converted via pdfkit stub fallback', { outputPath });
      return outputPath;
    }
  }

  // Images / unknown — copy as-is
  fs.copyFileSync(inputPath, outputPath);
  return outputPath;
};

export default { convertToPdf, isLibreOfficeAvailable };
