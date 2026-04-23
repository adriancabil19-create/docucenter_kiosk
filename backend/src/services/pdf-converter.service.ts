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
// LibreOffice detection + conversion (primary path)
// ---------------------------------------------------------------------------

export const isLibreOfficeAvailable = (): boolean => {
  try {
    execSync('which soffice', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
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
      `Presentation: ${path.basename(inputPath)}\n\nFull conversion requires LibreOffice.`,
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

  // Try LibreOffice first (pixel-perfect)
  if (OFFICE_EXTS.has(ext) && isLibreOfficeAvailable()) {
    try {
      // LibreOffice needs a writable home dir (Render/Docker may not have one)
      const tmpHome = path.join(os.tmpdir(), `lo-home-${process.pid}`);
      fs.mkdirSync(tmpHome, { recursive: true });

      const result = spawnSync(
        'soffice',
        ['--headless', '--convert-to', 'pdf', '--outdir', outputDir, inputPath],
        {
          timeout: 120_000,
          stdio: 'pipe',
          env: { ...process.env, HOME: tmpHome, UserInstallation: `file://${tmpHome}` },
        },
      );

      if (result.status === 0) {
        const inputBaseName = path.parse(inputPath).name;
        const loPdfPath = path.join(outputDir, `${inputBaseName}.pdf`);
        if (loPdfPath !== outputPath && fs.existsSync(loPdfPath)) {
          fs.renameSync(loPdfPath, outputPath);
        }
        if (fs.existsSync(outputPath)) {
          logger.info('Converted with LibreOffice', { outputPath });
          return outputPath;
        }
      }

      const stderr = result.stderr?.toString().trim();
      logger.warn('LibreOffice conversion failed, falling back', { stderr });
    } catch (err) {
      logger.warn('LibreOffice exception, falling back', { error: String(err) });
    }
  }

  // Fallback: mammoth/xlsx/pdfkit
  if (DOCX_EXTS.has(ext)) {
    await convertDocToPdfFallback(inputPath, outputPath);
    logger.info('DOCX converted via fallback', { outputPath });
    return outputPath;
  }

  if (XLSX_EXTS.has(ext)) {
    await convertXlsToPdfFallback(inputPath, outputPath);
    logger.info('XLSX converted via fallback', { outputPath });
    return outputPath;
  }

  if (PPTX_EXTS.has(ext)) {
    await convertPptToPdfFallback(inputPath, outputPath);
    logger.info('PPTX converted via fallback', { outputPath });
    return outputPath;
  }

  // Images / unknown — copy as-is
  fs.copyFileSync(inputPath, outputPath);
  return outputPath;
};

export default { convertToPdf, isLibreOfficeAvailable };
