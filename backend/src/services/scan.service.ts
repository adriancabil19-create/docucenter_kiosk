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
  doubleSided?: boolean;
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
  options: ScanOptions,
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
      
      # Select Brother scanner specifically
      $wiaDevice = $null
      try {
        # Look for Brother scanner specifically
        foreach ($deviceInfo in $deviceManager.DeviceInfos) {
          $deviceName = $deviceInfo.Properties['Name'].Value
          Write-Host "Checking device: $deviceName"
          if ($deviceName -like "*Brother*" -and $deviceName -like "*MFC*") {
            Write-Host "Found Brother MFC scanner: $deviceName"
            $wiaDevice = $deviceInfo.Connect()
            break
          }
        }
        
        # If no Brother found, use first available scanner
        if ($wiaDevice -eq $null) {
          $wiaDevice = $deviceManager.DeviceInfos | Where-Object { $_.Type -eq 1 } | Select-Object -First 1 | ForEach-Object { $_.Connect() }
        }
      } catch {
        Write-Host "Error selecting device: $($_.Exception.Message)"
        $wiaDevice = $deviceManager.DeviceInfos | Where-Object { $_.Type -eq 1 } | Select-Object -First 1 | ForEach-Object { $_.Connect() }
      }

      Write-Host "Connected to device"

      $useAdf = ${options.doubleSided ? 'true' : 'false'}
      # Try to access ADF item directly - Brother scanners often have multiple items
      $wiaItem = $null
      $adfFound = $false
      
      Write-Host "Scanner has $($wiaDevice.Items.Count) items"
      
      # List all items first
      for ($i = 1; $i -le $wiaDevice.Items.Count; $i++) {
        try {
          $item = $wiaDevice.Items[$i]
          Write-Host "Item $i : $($item.ItemID)"
          try {
            $name = $item.Properties.Item(4098).Value
            Write-Host "  Item Name: $name"
          } catch {
            # ignore missing name
          }
        } catch {
          Write-Host "Could not access item $i : $($_.Exception.Message)"
        }
      }

      # Choose ADF item if double-sided is requested
      if ($useAdf -eq 'true') {
        for ($i = 1; $i -le $wiaDevice.Items.Count; $i++) {
          try {
            $item = $wiaDevice.Items[$i]
            if ($item.ItemID -match 'ADF|Feeder|DocumentFeeder' -or ($item.Properties.Item(4098).Value -match 'ADF|Feeder|DocumentFeeder')) {
              $wiaItem = $item
              Write-Host "Using detected ADF item: $($wiaItem.ItemID)"
              $adfFound = $true
              break
            }
          } catch {
            # ignore unavailable properties
          }
        }
      }

      if (-not $adfFound) {
        try {
          Write-Host "FORCING Brother ADF: Attempting to access item 2..."
          $wiaItem = $wiaDevice.Items[2]
          Write-Host "SUCCESS: Using item 2: $($wiaItem.ItemID)"
          $adfFound = $true
        } catch {
          Write-Host "Item 2 not accessible: $($_.Exception.Message)"
          # If item 2 fails, try item 1
          try {
            $wiaItem = $wiaDevice.Items[1]
            Write-Host "Falling back to item 1: $($wiaItem.ItemID)"
          } catch {
            Write-Host "Item 1 also failed: $($_.Exception.Message)"
            throw "No scanner items available"
          }
        }
      }

      # DEBUG: Enumerate all available properties on this item
      Write-Host "=== AVAILABLE WIA PROPERTIES ==="
      try {
        foreach ($prop in $wiaItem.Properties) {
          try {
            $propId = $prop.PropertyID
            $propName = ""
            try { $propName = $prop.Name } catch { $propName = "Unknown" }
            Write-Host "Property $propId ($propName): Available"
          } catch {
            Write-Host "Could not enumerate property: $($_.Exception.Message)"
          }
        }
      } catch {
        Write-Host "Could not enumerate properties: $($_.Exception.Message)"
      }
      Write-Host "=== END PROPERTIES LIST ==="

      # AGGRESSIVE Brother ADF Configuration - Try EVERYTHING
      Write-Host "=== BROTHER ADF FORCE CONFIGURATION ==="
      
      function SetPropertyValue($item, $propId, $value, $label) {
        try {
          $property = $item.Properties.Item($propId)
          $property.Value = $value
          Write-Host "✓ Set $label ($propId) to $value"
        } catch {
          Write-Host "✗ Could not set $label ($propId): $($_.Exception.Message)"
        }
      }

      SetPropertyValue $wiaItem 3093 1 "DOCUMENT_HANDLING_SELECT"
      SetPropertyValue $wiaItem 3094 1 "DOCUMENT_HANDLING_CAPABILITIES"
      SetPropertyValue $wiaItem 3095 1 "FEEDER_READY"
      SetPropertyValue $wiaItem 3096 0 "PAGES"
      SetPropertyValue $wiaItem 3097 1 "PAGE_SIZE"
      SetPropertyValue $wiaItem 3098 1 "DOCUMENT_HANDLING_STATUS"

      if ($useAdf -eq 'true') {
        SetPropertyValue $wiaItem 3084 1 "DUPLEX"
      }

      Write-Host "=== ADF FORCE CONFIGURATION COMPLETE ==="

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
 * Attempt scanning using TWAIN via PowerShell COM objects.
 * Configures the TWAIN driver to use ADF (Automatic Document Feeder) only.
 */
const scanWithTWAIN = async (
  outputPath: string,
  options: ScanOptions,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const colorMode = options.colorMode === 'bw' ? 0 : 2; // 0 = BlackWhite, 2 = Color
    const dpi = options.dpi || 300;

    // PowerShell script to scan using TWAIN with ADF configuration
    const psScript = `
      # TWAIN scanning with ADF configuration
      try {
        # Try different TWAIN COM objects (excluding WIA.CommonDialog as it's not TWAIN)
        $twain = $null
        $comObjects = @("TWAIN.TWAINCtrl.1", "TwainControl.TwainCtrl.1", "BrTwainDS.BrTwainDS.1", "Brother.TWAIN.1", "TWAINDSM.TWAINDSM.1", "BrScnCtrl.BrScnCtrl.1", "Brother_Scanner.TWAIN", "MFCJ2730DW.TWAIN")
        
        foreach ($comObj in $comObjects) {
          try {
            $twain = New-Object -ComObject $comObj
            Write-Host "TWAIN COM object created successfully using: $comObj"
            break
          } catch {
            Write-Host "Failed to create COM object $comObj : $($_.Exception.Message)"
          }
        }
        
        if ($twain -eq $null) {
          Write-Host "No TWAIN COM objects available, skipping TWAIN scan"
          exit 2  # Special exit code to indicate TWAIN not available
        }

        # List available TWAIN sources
        Write-Host "Available TWAIN sources:"
        try {
          $sources = $twain.Sources
          if ($sources) {
            $sources | ForEach-Object {
              Write-Host "  Source: $($_.Name)"
            }
          }
        } catch {
          Write-Host "Could not enumerate TWAIN sources: $($_.Exception.Message)"
        }

        # Try to find Brother MFC-J2730DW source
        $sourceFound = $false
        try {
          $sources = $twain.Sources
          if ($sources) {
            $brotherSource = $sources | Where-Object { $_.Name -like "*Brother*" -or $_.Name -like "*MFC*" } | Select-Object -First 1
            if ($brotherSource) {
              $twain.SourceName = $brotherSource.Name
              Write-Host "Using Brother TWAIN source: $($brotherSource.Name)"
              $sourceFound = $true
            }
          }
        } catch {
          Write-Host "Could not find Brother source: $($_.Exception.Message)"
        }

        # If Brother source not found, try TWAIN_32 or default
        if (-not $sourceFound) {
          try {
            $twain.SourceName = "TWAIN_32"
            Write-Host "Using TWAIN_32 source"
          } catch {
            Write-Host "TWAIN_32 not available, using default source"
          }
        }

        # Configure TWAIN source to use ADF (Feeder)
        Write-Host "Configuring TWAIN for ADF (Feeder) mode..."
        try {
          $twain.Capability = 0x100A  # ICAP_SCAN_SOURCE
          $twain.CapabilityValue = 1   # TWSS_FEEDER (1 = feeder, 0 = flatbed)
          Write-Host "Set ICAP_SCAN_SOURCE to TWSS_FEEDER (1)"
        } catch {
          Write-Host "Failed to set scan source capability: $($_.Exception.Message)"
        }

        # Configure color mode
        try {
          $twain.Capability = 0x1003  # ICAP_PIXELTYPE
          $twain.CapabilityValue = ${colorMode}  # 0 = BW, 2 = Color
          Write-Host "Set color mode to ${colorMode}"
        } catch {
          Write-Host "Failed to set color mode: $($_.Exception.Message)"
        }

        # Configure DPI
        try {
          $twain.Capability = 0x1004  # ICAP_XRESOLUTION
          $twain.CapabilityValue = ${dpi}
          $twain.Capability = 0x1005  # ICAP_YRESOLUTION
          $twain.CapabilityValue = ${dpi}
          Write-Host "Set resolution to ${dpi} DPI"
        } catch {
          Write-Host "Failed to set resolution: $($_.Exception.Message)"
        }

        # Configure paper size (A4)
        try {
          $twain.Capability = 0x1006  # ICAP_SUPPORTEDSIZES
          $twain.CapabilityValue = 1   # TWSS_A4
          Write-Host "Set paper size to A4"
        } catch {
          Write-Host "Failed to set paper size: $($_.Exception.Message)"
        }

        # Additional ADF-specific settings
        try {
          # Set duplex mode based on doubleSided option
          $twain.Capability = 0x100C  # ICAP_DUPLEX
          if (${options.doubleSided ? 'true' : 'false'}) {
            $twain.CapabilityValue = 1   # TWDX_1PASSDUPLEX (enable duplex)
            Write-Host "Enabled duplex scanning (ADF mode)"
          } else {
            $twain.CapabilityValue = 0   # TWDX_NONE (disable duplex)
            Write-Host "Disabled duplex scanning"
          }
        } catch {
          Write-Host "Could not set duplex mode: $($_.Exception.Message)"
        }

        # Try to enable automatic feeding
        try {
          $twain.Capability = 0x100B  # ICAP_AUTOMATICCAPTURE
          $twain.CapabilityValue = 1   # TRUE
          Write-Host "Enabled automatic capture"
        } catch {
          Write-Host "Could not set automatic capture: $($_.Exception.Message)"
        }

        # Try to set feeder loaded
        try {
          $twain.Capability = 0x1030  # ICAP_FEEDERLOADED
          $twain.CapabilityValue = 1   # TRUE
          Write-Host "Set feeder loaded"
        } catch {
          Write-Host "Could not set feeder loaded: $($_.Exception.Message)"
        }

        # Start scanning
        Write-Host "Starting TWAIN scan..."
        $result = $twain.Acquire("${outputPath.replace(/\\/g, '\\\\')}")

        if ($result -eq 0) {
          Write-Host "TWAIN scan completed with result: $result"
          # Verify file was created
          if (Test-Path "${outputPath.replace(/\\/g, '\\\\')}") {
            $size = (Get-Item "${outputPath.replace(/\\/g, '\\\\')}").Length
            Write-Host "Output file size: $size bytes"
            if ($size -gt 1024) {
              Write-Host "TWAIN scan successful!"
              exit 0
            } else {
              Write-Error "Scan file too small ($size bytes)"
              exit 1
            }
          } else {
            Write-Error "Output file not created"
            exit 1
          }
        } else {
          Write-Error "TWAIN scan failed with result: $result"
          exit 1
        }
      } catch {
        Write-Error "TWAIN scanning error: $($_.Exception.Message)"
        exit 1
      }
    `;

    try {
      const execResult = execSync('powershell -NoProfile -NonInteractive -Command -', {
        input: psScript,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 120000, // 2 minutes timeout for scanning
        windowsHide: true,
      });

      const output = execResult.toString('utf8').trim();
      logger.info('TWAIN scan PowerShell output', { outputPath, options, output });

      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1024) {
        const fileSize = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
        const err = `TWAIN scan file invalid or missing (${outputPath}, size ${fileSize})`;
        logger.error('TWAIN scan file validation failed', { outputPath, fileSize });
        return { success: false, error: err };
      }

      return { success: true };
    } catch (execError: any) {
      const err = execError as Error;
      const stdout = execError.stdout ? execError.stdout.toString('utf8').trim() : undefined;
      const stderr = execError.stderr ? execError.stderr.toString('utf8').trim() : undefined;

      // Check if TWAIN is not available (exit code 2)
      if (execError.status === 2) {
        logger.info('TWAIN not available on this system, will use WIA fallback', {
          outputPath,
          options,
        });
        return { success: false, error: 'TWAIN not available' };
      }

      logger.error('TWAIN scan failed', {
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

      return { success: false, error: errorDetails };
    }
  } catch (err) {
    return { success: false, error: String(err) };
  }
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
export const scanDocument = async (options: Partial<ScanOptions> = {}): Promise<ScanResult> => {
  const scanId = `SCAN-${Date.now()}`;
  const platform = os.platform();

  const opts: ScanOptions = {
    colorMode: options.colorMode || 'color',
    dpi: options.dpi || 300,
    paperSize: options.paperSize || 'A4',
    outputFormat: options.outputFormat || 'pdf',
    doubleSided: options.doubleSided || false,
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
    // 1. Try TWAIN first (with ADF configuration)
    const twainResult = await scanWithTWAIN(tempImage, opts);
    if (twainResult.success) {
      logger.info('TWAIN scan successful', { scanId });
    } else {
      logger.warn('TWAIN scan failed, trying WIA', { scanId, error: twainResult.error });
      // 2. Fall back to WIA
      const wiaResult = await scanWithWIA(tempImage, opts);
      if (!wiaResult.success) {
        return { success: false, error: twainResult.error || wiaResult.error };
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
  pdfPath: string,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const PDFDocument = require('pdfkit');
    const fs = require('fs');

    // Create a new PDF document
    const doc = new PDFDocument({
      size: 'A4', // Default size, will be resized by print service if needed
      margin: 0,
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
      valign: 'center',
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

interface ADFStatus {
  ready: boolean;
  status: string;
  error?: string;
}

/**
 * Check if the Brother MFC-J2730DW ADF (Automatic Document Feeder) is ready
 */
export const checkADFStatus = async (): Promise<ADFStatus> => {
  try {
    const psScript = `
      Add-Type -AssemblyName "WIA"
      $deviceManager = New-Object -ComObject WIA.DeviceManager
      
      Write-Host "Checking ADF status..."
      
      # Find Brother scanner
      $wiaDevice = $null
      foreach ($deviceInfo in $deviceManager.DeviceInfos) {
        $deviceName = $deviceInfo.Properties['Name'].Value
        if ($deviceName -like "*Brother*" -and $deviceName -like "*MFC*") {
          Write-Host "Found Brother MFC scanner: $deviceName"
          $wiaDevice = $deviceInfo.Connect()
          break
        }
      }
      
      if ($wiaDevice -eq $null) {
        Write-Error "Brother MFC scanner not found"
        exit 1
      }

      # Try to access ADF item (usually item 2 for Brother scanners)
      $adfItem = $null
      try {
        $adfItem = $wiaDevice.Items[2]
        Write-Host "Found ADF item"
      } catch {
        Write-Host "Item 2 not accessible, trying item 1..."
        try {
          $adfItem = $wiaDevice.Items[1]
        } catch {
          Write-Error "Could not access scanner items"
          exit 1
        }
      }

      # Check FEEDER_READY property (WIA property 3095)
      $feederReady = $false
      try {
        $feederReadyProp = $adfItem.Properties.Item(3095)
        $feederReady = $feederReadyProp.Value -eq 1
        Write-Host "FEEDER_READY property: $($feederReadyProp.Value)"
      } catch {
        Write-Host "Could not read FEEDER_READY property: $($_.Exception.Message)"
      }

      # Check DOCUMENT_HANDLING_STATUS property (3098)
      $docHandlingStatus = $null
      try {
        $statusProp = $adfItem.Properties.Item(3098)
        $docHandlingStatus = $statusProp.Value
        Write-Host "DOCUMENT_HANDLING_STATUS: $docHandlingStatus"
      } catch {
        Write-Host "Could not read DOCUMENT_HANDLING_STATUS: $($_.Exception.Message)"
      }

      # Return status
      if ($feederReady) {
        Write-Host "OKAY - ADF is ready for scanning"
        exit 0
      } else {
        Write-Host "ADF not ready - waiting for documents"
        exit 2
      }
    `;

    try {
      const execResult = execSync('powershell -NoProfile -NonInteractive -Command -', {
        input: psScript,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000,
        windowsHide: true,
      });

      logger.info('ADF Status Check', { output: execResult.toString('utf8') });
      return { ready: true, status: 'OKAY - ADF Ready' };
    } catch (execError: any) {
      if (execError.status === 2) {
        logger.info('ADF Not Ready', { message: 'No document in ADF yet' });
        return { ready: false, status: 'Please place your document on the scanner, thank you.' };
      }

      const stderr = execError.stderr ? execError.stderr.toString('utf8').trim() : '';
      logger.warn('ADF Status Check Failed', { stderr, error: execError.message });

      // Default to not ready if unable to check
      return { ready: false, status: 'Please place your document on the scanner, thank you.' };
    }
  } catch (err) {
    logger.error('ADF Status Check Error', { error: (err as Error).message });
    return {
      ready: false,
      status: 'Please place your document on the scanner, thank you.',
      error: (err as Error).message,
    };
  }
};

/**
 * Perform photocopying using the scanner's ADF and printer.
 * This scans documents from the ADF and prints them.
 */
export const photocopyDocument = async (
  options: Partial<CopyOptions> = {},
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
      outputFormat: 'jpg', // We'll convert to JPG for printing
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
    let printResult: { success: boolean; method: string; error?: string } = {
      success: true,
      method: 'none',
    };

    for (let i = 0; i < opts.copies; i++) {
      logger.info('Printing copy', { copyId, copyNumber: i + 1 });
      const result = await printPdfFile(
        pdfPath,
        `${copyId}_copy${i + 1}`,
        opts.paperSize,
        opts.colorMode,
        opts.quality,
      );
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
      logger.warn('Failed to clean up temporary files', {
        copyId,
        error: (cleanupError as Error).message,
      });
    }

    logger.info('Photocopy job completed', { copyId, jobId: copyId });

    return { success: true, jobId: copyId };
  } catch (error) {
    const err = error as Error;
    logger.error('Photocopy error', { copyId, error: err.message });
    return { success: false, error: err.message };
  }
};
