import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mammoth = require('mammoth') as typeof import('mammoth');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx') as typeof import('xlsx');

export const isLibreOfficeAvailable = (): boolean => false;

const DOCX_EXTS = new Set(['.doc', '.docx', '.odt']);
const XLSX_EXTS = new Set(['.xls', '.xlsx', '.ods', '.csv']);
const PPTX_EXTS = new Set(['.ppt', '.pptx', '.odp']);

// ---------------------------------------------------------------------------
// DOCX → PDF (mammoth HTML + cheerio + pdfkit, images preserved)
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
    } catch {
      // unsupported image format — skip silently
    }
  }

  function renderChildren(el: Node) {
    const children = $(el).contents().toArray();
    let pendingText = '';

    const flushText = (opts?: { bold?: boolean; size?: number }) => {
      const t = pendingText.trim();
      if (!t) { pendingText = ''; return; }
      if (opts?.bold) doc.font('Helvetica-Bold');
      if (opts?.size) doc.fontSize(opts.size);
      doc.text(t, { lineGap: 2, continued: false });
      doc.font('Helvetica').fontSize(11);
      pendingText = '';
    };

    for (const child of children) {
      if (child.type === 'text') {
        pendingText += (child.data as string) ?? '';
        continue;
      }
      if (child.type !== 'tag') continue;

      const tag = (child.name as string).toLowerCase();

      if (tag === 'img') {
        flushText();
        addImage($(child).attr('src') ?? '');
        continue;
      }

      if (tag === 'strong' || tag === 'b' || tag === 'em' || tag === 'i') {
        flushText();
        const inner = $(child).text().trim();
        if (inner) {
          doc.font(tag === 'em' || tag === 'i' ? 'Helvetica-Oblique' : 'Helvetica-Bold')
            .fontSize(11)
            .text(inner, { lineGap: 2, continued: false });
          doc.font('Helvetica').fontSize(11);
        }
        continue;
      }

      // Nested inline content
      flushText();
      renderChildren(child);
    }

    flushText();
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
      // Check for images inside this paragraph
      const imgs = $(el).find('img');
      if (imgs.length && !$(el).text().trim()) {
        // image-only paragraph
        imgs.each((_j, img) => addImage($(img).attr('src') ?? ''));
      } else {
        renderChildren(el);
        doc.moveDown(0.2);
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

    // Fallback
    const text = $(el).text().trim();
    if (text) {
      doc.font('Helvetica').fontSize(11).text(text, { lineGap: 2 });
      doc.moveDown(0.2);
    }
  });
}

const convertDocToPdf = async (inputPath: string, outputPath: string): Promise<void> => {
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

// ---------------------------------------------------------------------------
// XLSX → PDF
// ---------------------------------------------------------------------------

const convertXlsToPdf = async (inputPath: string, outputPath: string): Promise<void> => {
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

// ---------------------------------------------------------------------------
// PPTX → PDF (best-effort text extraction)
// ---------------------------------------------------------------------------

const convertPptToPdf = async (inputPath: string, outputPath: string): Promise<void> => {
  try {
    const wb = XLSX.readFile(inputPath);
    const texts: string[] = [];
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name];
      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
      texts.push(`--- ${name} ---`);
      for (const row of rows) {
        texts.push((row as unknown[]).map((c) => String(c ?? '')).join(' '));
      }
    }

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 72, size: 'A4' });
      const out = fs.createWriteStream(outputPath);
      doc.pipe(out);
      doc.fontSize(11).font('Helvetica').text(texts.join('\n') || '(no text content)');
      doc.end();
      out.on('finish', resolve);
      out.on('error', reject);
    });
  } catch {
    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 72, size: 'A4' });
      const out = fs.createWriteStream(outputPath);
      doc.pipe(out);
      doc.fontSize(12).text(`Presentation: ${path.basename(inputPath)}\n\nFull conversion requires LibreOffice.`);
      doc.end();
      out.on('finish', resolve);
      out.on('error', reject);
    });
  }
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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

  if (DOCX_EXTS.has(ext)) {
    await convertDocToPdf(inputPath, outputPath);
    logger.info('DOCX converted to PDF', { outputPath });
    return outputPath;
  }

  if (XLSX_EXTS.has(ext)) {
    await convertXlsToPdf(inputPath, outputPath);
    logger.info('XLSX converted to PDF', { outputPath });
    return outputPath;
  }

  if (PPTX_EXTS.has(ext)) {
    await convertPptToPdf(inputPath, outputPath);
    logger.info('PPTX converted to PDF', { outputPath });
    return outputPath;
  }

  // Images / unknown formats — copy as-is
  fs.copyFileSync(inputPath, outputPath);
  return outputPath;
};

export default { convertToPdf, isLibreOfficeAvailable };
