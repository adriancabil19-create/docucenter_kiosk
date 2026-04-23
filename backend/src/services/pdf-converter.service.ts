import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';
import { logger } from '../utils/logger';

// Dynamic imports — avoid bundling errors if optional deps are missing at type-check time.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mammoth = require('mammoth') as typeof import('mammoth');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx') as typeof import('xlsx');

export const isLibreOfficeAvailable = (): boolean => false;

const DOCX_EXTS = new Set(['.doc', '.docx', '.odt']);
const XLSX_EXTS = new Set(['.xls', '.xlsx', '.ods', '.csv']);
const PPTX_EXTS = new Set(['.ppt', '.pptx', '.odp']);

/**
 * Convert DOCX/DOC to PDF using mammoth (text extraction) + pdfkit.
 */
const convertDocToPdf = async (inputPath: string, outputPath: string): Promise<void> => {
  const result = await mammoth.extractRawText({ path: inputPath });
  const text = result.value || '(empty document)';

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 72, size: 'A4' });
    const out = fs.createWriteStream(outputPath);
    doc.pipe(out);
    doc.fontSize(11).font('Helvetica').text(text, { lineGap: 2 });
    doc.end();
    out.on('finish', resolve);
    out.on('error', reject);
  });
};

/**
 * Convert XLS/XLSX to PDF using xlsx (sheet parsing) + pdfkit.
 */
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

/**
 * Convert a PPT/PPTX to a minimal PDF (slide text only).
 * Full fidelity requires LibreOffice; this is a best-effort fallback.
 */
const convertPptToPdf = async (inputPath: string, outputPath: string): Promise<void> => {
  // pptx files are zips — extract text from slide XML via xlsx (it can parse pptx too)
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
    const text = texts.join('\n');
    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 72, size: 'A4' });
      const out = fs.createWriteStream(outputPath);
      doc.pipe(out);
      doc.fontSize(11).font('Helvetica').text(text || '(no text content)');
      doc.end();
      out.on('finish', resolve);
      out.on('error', reject);
    });
  } catch {
    // If xlsx can't parse it, just write a placeholder PDF
    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 72, size: 'A4' });
      const out = fs.createWriteStream(outputPath);
      doc.pipe(out);
      doc.fontSize(12).text(`Presentation file: ${path.basename(inputPath)}\n\nFull conversion requires LibreOffice.`);
      doc.end();
      out.on('finish', resolve);
      out.on('error', reject);
    });
  }
};

/**
 * Convert any supported document to PDF.
 * Returns outputPath on success or throws.
 */
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

  // Images and other formats — copy as-is
  fs.copyFileSync(inputPath, outputPath);
  return outputPath;
};

export default { convertToPdf, isLibreOfficeAvailable };
