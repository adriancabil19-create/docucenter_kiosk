import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync } from 'child_process';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// LibreOffice detection + conversion
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
    const result = spawnSync('which', ['soffice'], { stdio: 'pipe' });
    if (result.status === 0) return 'soffice';
    return null;
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
    const soffice = getLibreOfficeBin();
    if (!soffice) {
      throw new Error('LibreOffice is not installed. Cannot convert Office documents to PDF.');
    }
    convertWithLibreOffice(soffice, inputPath, outputDir, outputPath);
    logger.info('Converted with LibreOffice', { outputPath });
    return outputPath;
  }

  // Images / other — copy as-is
  fs.copyFileSync(inputPath, outputPath);
  return outputPath;
};

export default { convertToPdf, isLibreOfficeAvailable };
