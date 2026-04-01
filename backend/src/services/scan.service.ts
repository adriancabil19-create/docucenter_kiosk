import { logger } from '../utils/logger';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { config } from '../utils/config';

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

// ─────────────────────────────────────────────────────────────────────────────
// Windows Image Acquisition (WIA) scanning
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scan a document using Windows Image Acquisition (WIA) via PowerShell.
 * This is the most reliable method for Windows scanning.
 */
const scanWithWIA = async (
  outputPath: string,
  options: ScanOptions
): Promise<{ success: boolean; error?: string }> => {
  try {
    const colorMode = options.colorMode === 'bw' ? 1 : 2; // 1 = BlackWhite, 2 = Color
    const dpi = options.dpi || 300;

    // PowerShell script to scan using WIA
    const psScript = `
      Add-Type -AssemblyName "WIA"
      $deviceManager = New-Object -ComObject WIA.DeviceManager
      
      Write-Host "Available WIA devices:"
      $deviceManager.DeviceInfos | ForEach-Object { 
        Write-Host "  $($_.DeviceID) - $($_.Type) - $($_.Properties['Name'].Value)"
      }
      
      $device = $deviceManager.DeviceInfos | Where-Object { $_.Type -eq 1 } | Select-Object -First 1

      if ($device -eq $null) {
        throw "No scanner found"
      }
      
      Write-Host "Selected device: $($device.DeviceID) - $($device.Properties['Name'].Value)"
      
      $wiaDevice = $device.Connect()
      Write-Host "Connected to device"

      # Prefer ADF item if available in scanner items; fallback to first item
      $wiaItem = $wiaDevice.Items[1]
      if ($wiaDevice.Items.Count -gt 1) {
        try {
          $wiaItem = $wiaDevice.Items[2]
          Write-Host "Selected second item (possible ADF): $($wiaItem.ItemID)"
        } catch {
          Write-Host "Second item not accessible, using first item"
          $wiaItem = $wiaDevice.Items[1]
        }
      } else {
        Write-Host "Single item detected, using first item: $($wiaItem.ItemID)"
      }

      # Determine ADF capability explicitly
      $adfSupported = $false
      try {
        $handlingCapabilities = $wiaItem.Properties["6151"].Value  # WIA_IPS_DOCUMENT_HANDLING_CAPABILITIES
        Write-Host "Document handling capabilities: $handlingCapabilities"
        if (($handlingCapabilities -band 1) -ne 0) {  # FEEDER bit
          $adfSupported = $true
          Write-Host "ADF capability detected"
        } else {
          Write-Host "ADF capability not present"
        }
      } catch {
        Write-Host "Could not read document handling capabilities: $($_.Exception.Message)"
      }

      # Set scanner role to ADF if available
      if ($adfSupported) {
        try {
          $wiaItem.Properties["6145"].Value = 1  # WIA_IPS_DOCUMENT_HANDLING_SELECT = FEEDER
          Write-Host "Set document handling to FEEDER (ADF)"

          try {
            $wiaItem.Properties["6152"].Value = 1  # WIA_IPS_FEEDER_READY
            Write-Host "Set feeder ready"
          } catch {
            Write-Host "Unable to set feeder ready: $($_.Exception.Message)"
          }

          try {
            $wiaItem.Properties["6153"].Value = 0  # WIA_IPS_PAGES = All pages
            Write-Host "Set pages to scan: all"
          } catch {
            Write-Host "Unable to set pages property: $($_.Exception.Message)"
          }
        } catch {
          Write-Host "Failed to set ADF mode: $($_.Exception.Message)"
        }
      } else {
        Write-Host "ADF not supported from scanner; falling back to flatbed"
        try {
          $wiaItem.Properties["6145"].Value = 0  # WIA_IPS_DOCUMENT_HANDLING_SELECT = FLATBED
          Write-Host "Set document handling to FLATBED"
        } catch {
          Write-Host "Unable to set flatbed: $($_.Exception.Message)"
        }
      }

      # Perform the scan
      Write-Host "Starting scan transfer..."
      $wiaImage = $wiaItem.Transfer()
      Write-Host "Scan transfer completed"

      # Save as file
      $imageProcess = New-Object -ComObject WIA.ImageProcess
      $imageProcess.Filters.Add($imageProcess.FilterInfos.Item("Convert").FilterID)
      $imageProcess.Filters.Item(1).Properties.Item("FormatID").Value = "{B96B3CAB-0728-11D3-9D7B-0000F81EF32E}"  # JPG format
      $imageProcess.Filters.Item(1).Properties.Item("Quality").Value = 100

      $wiaImage = $imageProcess.Apply($wiaImage)
      $wiaImage.SaveFile("${outputPath.replace(/\\/g, '\\\\')}")
      Write-Host "Image saved to ${outputPath.replace(/\\/g, '\\\\')}"
      # Confirm output file
      if (-Not (Test-Path -Path "${outputPath.replace(/\\/g, '\\\\')}")) {
        throw "Scan output not found"
      }
      $size = (Get-Item "${outputPath.replace(/\\/g, '\\\\')}").Length
      Write-Host "Output path size: $size"
      if ($size -lt 1024) {
        throw "Scan output too small ($size bytes)"
      }
    `;

    try {
      const execResult = execSync('powershell -NoProfile -NonInteractive -Command -', {
        input: psScript,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 90000,
        windowsHide: true,
      });

      const output = execResult.toString('utf8').trim();
      logger.info('WIA scan PowerShell output', { outputPath, options, output });

      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1024) {
        const fileSize = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
        const err = `Scan file invalid or missing (${outputPath}, size ${fileSize})`;
        logger.error('WIA scan file validation failed', { outputPath, fileSize });
        return { success: false, error: err };
      }

      return { success: true };
    } catch (execError: any) {
      const err = execError as Error;
      const stdout = execError.stdout ? execError.stdout.toString('utf8').trim() : undefined;
      const stderr = execError.stderr ? execError.stderr.toString('utf8').trim() : undefined;
      
      logger.error('WIA scan failed', {
        error: err.message,
        outputPath,
        options,
        stdout,
        stderr,
      });

      let errorDetails = err.message;
      if (stderr) {
        errorDetails += ` | stderr: ${stderr}`;
      }
      if (stdout) {
        errorDetails += ` | stdout: ${stdout}`;
      }
      if (errorDetails.includes('Command failed:')) {
        errorDetails = 'PowerShell execution failed - check scanner connection and ADF status';
      }

      return { success: false, error: errorDetails };
    }
  } catch (err) {
    return { success: false, error: String(err) };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// TWAIN scanning (alternative method)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attempt scanning using TWAIN via a third-party tool or direct COM.
 * This is more complex and less reliable than WIA.
 */
const scanWithTWAIN = async (
  outputPath: string,
  options: ScanOptions
): Promise<{ success: boolean; error?: string }> => {
  // TWAIN implementation would require additional dependencies
  // For now, fall back to WIA
  return scanWithWIA(outputPath, options);
};

// ─────────────────────────────────────────────────────────────────────────────
// Convert scanned image to PDF if needed
// ─────────────────────────────────────────────────────────────────────────────
// Main scanning function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scan a document using the best available method for the current platform.
 *
 * Windows strategy:
 *   1. Windows Image Acquisition (WIA) - most reliable
 *   2. TWAIN - alternative method
 */
export const scanDocument = async (
  options: Partial<ScanOptions> = {}
): Promise<ScanResult> => {
  const scanId = `SCAN-${Date.now()}`;
  const platform = os.platform();

  const opts: ScanOptions = {
    colorMode: options.colorMode || 'color',
    dpi: options.dpi || 300,
    paperSize: options.paperSize || 'A4',
    outputFormat: options.outputFormat || 'pdf',
  };

  logger.info('Scan document request', { scanId, options: opts });

  if (platform !== 'win32') {
    return {
      success: false,
      error: 'Scanning is only supported on Windows platforms',
    };
  }

  const tempDir = os.tmpdir();
  const tempImage = path.join(tempDir, `scan_${scanId}.jpg`);
  const finalPath = path.join(tempDir, `scan_${scanId}.${opts.outputFormat}`);

  try {
    // 1. Scan using WIA
    const scanResult = await scanWithWIA(tempImage, opts);
    if (!scanResult.success) {
      logger.warn('WIA scan failed, trying TWAIN', { scanId, error: scanResult.error });
      const twainResult = await scanWithTWAIN(tempImage, opts);
      if (!twainResult.success) {
        return { success: false, error: scanResult.error || twainResult.error };
      }
    }

    // 2. Convert to desired format if needed
    if (opts.outputFormat === 'pdf') {
      const convertResult = await convertImageToPdf(tempImage, finalPath);
      if (!convertResult.success) {
        logger.warn('PDF conversion failed, returning BMP', { scanId, error: convertResult.error });
        // Return the BMP file as fallback
        return { success: true, filePath: tempImage, method: 'wia-bmp' };
      }
    } else {
      // Just rename/copy to final path
      fs.copyFileSync(tempImage, finalPath);
    }

    logger.info('Document scanned successfully', { scanId, filePath: finalPath });
    return { success: true, filePath: finalPath, method: 'wia' };

  } catch (error) {
    const err = error as Error;
    logger.error('Scan error', { scanId, error: err.message });
    return { success: false, error: err.message };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert image to PDF for printing
 */
const convertImageToPdf = async (
  imagePath: string,
  pdfPath: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const PDFDocument = require('pdfkit');
    const fs = require('fs');
    
    // Create a new PDF document
    const doc = new PDFDocument({
      size: 'A4', // Default size, will be resized by print service if needed
      margin: 0
    });
    
    // Pipe the PDF to a file
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);
    
    // Add the image to the PDF
    // PDFKit supports JPG images directly
    const imageBuffer = fs.readFileSync(imagePath);
    doc.image(imageBuffer, 0, 0, { 
      width: doc.page.width,
      height: doc.page.height,
      align: 'center',
      valign: 'center'
    });
    
    // Finalize the PDF
    doc.end();
    
    // Wait for the stream to finish
    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
    
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
};

/**
 * Get the appropriate tray for paper size
 */
const getTrayForPaperSize = (paperSize: string): string => {
  switch (paperSize.toLowerCase()) {
    case 'folio':
      return 'MPTray'; // Multi-purpose tray
    case 'letter':
      return 'Tray2';
    case 'a4':
    default:
      return 'Tray1';
  }
};

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

/**
 * Perform photocopying using the scanner's ADF and printer.
 * This scans documents from the ADF and prints them.
 */
export const photocopyDocument = async (
  options: Partial<CopyOptions> = {}
): Promise<CopyResult> => {
  const copyId = `COPY-${Date.now()}`;

  const opts: CopyOptions = {
    copies: options.copies || 1,
    colorMode: options.colorMode || 'bw',
    paperSize: options.paperSize || 'A4',
    quality: options.quality || 'normal',
  };

  logger.info('Photocopy request', { copyId, options: opts });

  try {
    // Create temporary directory for scanned images
    const tempDir = path.join(os.tmpdir(), 'webdoc-photocopy');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Scan document using ADF
    const scanFileName = `scan_${copyId}.jpg`;
    const scanPath = path.join(tempDir, scanFileName);

    logger.info('Starting photocopy scan', { copyId, scanPath });

    const scanResult = await scanWithWIA(scanPath, {
      colorMode: opts.colorMode,
      dpi: opts.quality === 'high' ? 600 : opts.quality === 'low' ? 150 : 300,
      paperSize: opts.paperSize,
      outputFormat: 'jpg' // We'll convert to JPG for printing
    });

    if (!scanResult.success) {
      logger.error('Photocopy scan failed', { copyId, error: scanResult.error });
      throw new Error(`Scan failed: ${scanResult.error}`);
    }

    logger.info('Photocopy scan completed', { copyId, scanPath });

    // Convert JPG to PDF for printing
    const pdfPath = path.join(tempDir, `print_${copyId}.pdf`);
    logger.info('Converting image to PDF', { copyId, scanPath, pdfPath });
    
    const convertResult = await convertImageToPdf(scanPath, pdfPath);
    
    if (!convertResult.success) {
      logger.error('PDF conversion failed', { copyId, error: convertResult.error });
      throw new Error(`PDF conversion failed: ${convertResult.error}`);
    }

    logger.info('PDF conversion completed', { copyId, pdfPath });

    // Print the scanned document (multiple copies)
    logger.info('Starting photocopy printing', { copyId, copies: opts.copies, pdfPath });
    
    const { printPdfFile } = await import('./print.service');
    let printResult: { success: boolean; method: string; error?: string } = { success: true, method: 'none' };
    
    for (let i = 0; i < opts.copies; i++) {
      logger.info('Printing copy', { copyId, copyNumber: i + 1 });
      const result = await printPdfFile(pdfPath, `${copyId}_copy${i + 1}`, opts.paperSize, opts.colorMode, opts.quality);
      if (!result.success) {
        logger.error('Print copy failed', { copyId, copyNumber: i + 1, error: result.error });
        printResult = result;
        break; // Stop on first failure
      }
      printResult = result; // Keep the last successful result
    }

    if (!printResult.success) {
      logger.error('Photocopy printing failed', { copyId, error: printResult.error });
      throw new Error(`Print failed: ${printResult.error}`);
    }

    logger.info('Photocopy printing completed', { copyId });

    // Clean up temporary files
    try {
      fs.unlinkSync(scanPath);
      fs.unlinkSync(pdfPath);
    } catch (cleanupError) {
      logger.warn('Failed to clean up temporary files', { copyId, error: (cleanupError as Error).message });
    }

    logger.info('Photocopy job completed', { copyId, jobId: copyId });

    return { success: true, jobId: copyId };

  } catch (error) {
    const err = error as Error;
    logger.error('Photocopy error', { copyId, error: err.message });
    return { success: false, error: err.message };
  }
};