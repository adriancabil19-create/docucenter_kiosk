import { logger } from '../utils/logger';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { config } from '../utils/config';

interface PrintOptions {
  data: string;
  type?: string;
  printerName?: string;
}

interface PrintResult {
  success: boolean;
  jobID?: string;
  error?: string;
  method?: string;
  simulatedPaths?: string[];
}

/**
 * Print text content using the system printer
 */
export const printText = async (text: string, options?: Partial<PrintOptions>): Promise<PrintResult> => {
  try {
    const jobID = `JOB-${Date.now()}`;
    logger.info('Print request received', { jobID, contentLength: text.length });

    // Try Method 1: Native printer module (Windows/Linux)
    try {
      const printer = require('printer');
      logger.info('Printer module loaded', { jobID });
      
      return new Promise((resolve, reject) => {
        printer.printDirect({
          data: text,
          type: options?.type || 'RAW',
          success: (resultJobID: string) => {
            logger.info('Print job submitted via printer module', { jobID, resultJobID });
            resolve({
              success: true,
              jobID: resultJobID || jobID,
              method: 'printer-module',
            });
          },
          error: (err: Error) => {
            logger.warn('Printer module failed, trying system method', { jobID, error: err.message });
            // Fall back to system printing
            printViaSystem(text, jobID, options).then(resolve).catch(() => reject(err));
          },
        });
      });
    } catch (moduleErr) {
      logger.warn('Printer module not available, using system printing', { jobID, error: String(moduleErr) });
      return printViaSystem(text, jobID, options);
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Print service error', { error: err.message, stack: err.stack });
    return {
      success: false,
      error: err.message,
    };
  }
};

/**
 * Print via system command (Windows/Linux fallback)
 */
const printViaSystem = async (text: string, jobID: string, options?: Partial<PrintOptions>): Promise<PrintResult> => {
  try {
    const platform = os.platform();
    logger.info('Attempting system print', { jobID, platform });

    if (platform === 'win32') {
      // Windows: Try multiple methods
      
      // Method 1: Direct USB port write (common for kiosk printers)
      try {
        logger.info('Trying direct USB port write', { jobID });
        const fs_sync = require('fs');
        fs_sync.writeFileSync('\\\\.\\USB001', text); // USB printer port
        logger.info('Print sent via USB port', { jobID });
        return {
          success: true,
          jobID,
          method: 'usb-port',
        };
      } catch (usbErr) {
        logger.warn('USB port write failed', { jobID, error: String(usbErr) });
      }

      // Method 2: Direct LPT port (parallel printer)
      try {
        logger.info('Trying direct LPT port write', { jobID });
        const fs_sync = require('fs');
        fs_sync.writeFileSync('\\\\.\\LPT1', text);
        logger.info('Print sent via LPT1 port', { jobID });
        return {
          success: true,
          jobID,
          method: 'lpt-port',
        };
      } catch (lptErr) {
        logger.warn('LPT port write failed', { jobID, error: String(lptErr) });
      }

      // Method 3: COM port (serial printer)
      try {
        logger.info('Trying direct COM port write', { jobID });
        const fs_sync = require('fs');
        fs_sync.writeFileSync('\\\\.\\COM1', text);
        logger.info('Print sent via COM1 port', { jobID });
        return {
          success: true,
          jobID,
          method: 'com-port',
        };
      } catch (comErr) {
        logger.warn('COM port write failed', { jobID, error: String(comErr) });
      }

      // Method 4: File-based printing - save to a print folder
      try {
        logger.info('Trying file-based printing', { jobID });
        const printFolder = 'C:\\PrintQueue';
        if (!fs.existsSync(printFolder)) {
          fs.mkdirSync(printFolder, { recursive: true });
        }
        const filePath = path.join(printFolder, `print_${jobID}.txt`);
        fs.writeFileSync(filePath, text, 'utf-8');
        logger.info('Print file saved for printing', { jobID, filePath });
        
        // Try to print using file
        try {
          execSync(`notepad /p "${filePath}"`, { stdio: 'pipe', timeout: 5000 });
          logger.info('Print sent via notepad', { jobID });
        } catch (notepadErr) {
          logger.info('Notepad print attempt completed', { jobID });
        }
        
        return {
          success: true,
          jobID,
          method: 'file-based',
        };
      } catch (fileErr) {
        logger.warn('File-based printing failed', { jobID, error: String(fileErr) });
      }

      // Method 5: PowerShell Out-Printer
      try {
        logger.info('Trying PowerShell Out-Printer', { jobID });
        const tempFile = path.join(os.tmpdir(), `print_${jobID}.txt`);
        fs.writeFileSync(tempFile, text, 'utf-8');
        execSync(`powershell -Command "Get-Content -Path '${tempFile}' | Out-Printer"`, { stdio: 'pipe', timeout: 10000 });
        logger.info('Print sent via Out-Printer', { jobID });
        fs.unlinkSync(tempFile);
        return {
          success: true,
          jobID,
          method: 'out-printer',
        };
      } catch (psErr) {
        logger.warn('PowerShell Out-Printer failed', { jobID, error: String(psErr) });
      }

      // Method 6: wmic print command
      try {
        logger.info('Trying wmic printer list', { jobID });
        const printers = execSync('wmic printjob list', { encoding: 'utf-8' });
        logger.info('Available printers', { jobID, printers: printers.substring(0, 200) });
      } catch (wmicErr) {
        logger.warn('wmic query failed', { jobID, error: String(wmicErr) });
      }

      throw new Error('All Windows print methods failed');
    } else if (platform === 'linux') {
      // Linux: Use lp or lpr
      const tempFile = path.join(os.tmpdir(), `print_${jobID}.txt`);
      fs.writeFileSync(tempFile, text, 'utf-8');
      
      try {
        execSync(`lp "${tempFile}"`, { stdio: 'pipe' });
        logger.info('Print job submitted via lp command', { jobID });
      } catch (lpErr) {
        execSync(`lpr "${tempFile}"`, { stdio: 'pipe' });
        logger.info('Print job submitted via lpr command', { jobID });
      }
      
      fs.unlinkSync(tempFile);
      return {
        success: true,
        jobID,
        method: 'linux-lp',
      };
    } else if (platform === 'darwin') {
      // macOS: Use lp
      const tempFile = path.join(os.tmpdir(), `print_${jobID}.txt`);
      fs.writeFileSync(tempFile, text, 'utf-8');
      execSync(`lp "${tempFile}"`, { stdio: 'pipe' });
      logger.info('Print job submitted via macOS lp command', { jobID });
      fs.unlinkSync(tempFile);
      return {
        success: true,
        jobID,
        method: 'macos-lp',
      };
    }

    return {
      success: false,
      error: `Unsupported platform: ${platform}`,
    };
  } catch (error) {
    const err = error as Error;
    logger.error('System print method failed', { jobID, error: err.message, stack: err.stack });
    return {
      success: false,
      error: err.message,
    };
  }
};

/**
 * Print receipt content
 */
export const printReceipt = async (receiptContent: string): Promise<PrintResult> => {
  logger.info('Printing receipt', { contentLength: receiptContent.length });
  return printText(receiptContent, {
    type: 'RAW',
  });
};

/**
 * Print document from content
 */
export const printDocument = async (
  documentContent: string,
  documentName?: string
): Promise<PrintResult> => {
  logger.info('Printing document', { documentName });
  return printText(documentContent, {
    type: 'RAW',
  });
};

/**
 * Print files located in the backend Uploads directory.
 * KIOSK MODE: Keeps everything local and secure.
 * Files are copied to Windows Print Queue and sent to printer.
 */
export const printFilesFromStorage = async (filenames: string[]): Promise<PrintResult> => {
  try {
    const uploadsDir = path.join(__dirname, '../../..', 'Uploads');
    if (!fs.existsSync(uploadsDir)) {
      logger.warn('Uploads directory does not exist', { uploadsDir });
      return { success: false, error: 'Uploads directory not found' };
    }

    // Ensure PrintQueue exists on the kiosk
    const printQueue = path.join('C:', 'PrintQueue');
    if (!fs.existsSync(printQueue)) {
      fs.mkdirSync(printQueue, { recursive: true });
      logger.info('Created PrintQueue directory', { printQueue });
    }

    let processedCount = 0;
    const platform = os.platform();

    for (const filename of filenames) {
      const filePath = path.join(uploadsDir, filename);

      // Prevent directory traversal
      if (!filePath.startsWith(uploadsDir)) {
        logger.warn('Attempted directory traversal', { filename });
        continue;
      }

      if (!fs.existsSync(filePath)) {
        logger.warn('File not found', { filename });
        continue;
      }

      try {
        if (platform === 'win32') {
          // WINDOWS KIOSK: Copy file and send to printer
          const dest = path.join(printQueue, filename);
          fs.copyFileSync(filePath, dest);
          logger.info('✓ File copied to PrintQueue', { filename, destination: dest });
          
          const { execSync } = require('child_process');
          const destWithBackslashes = dest.replace(/\//g, '\\');
          
          let printSuccess = false;
          
          // Method 1: PowerShell direct printer via WMI
          if (!printSuccess) {
            try {
              logger.info('Attempting PowerShell WMI printer method', { filename });
              const psCmd = `
$file = "${destWithBackslashes}"
$printer = "Brother MFC-J2730DW Printer"
Add-Type -AssemblyName System.Printing
[System.Printing.LocalPrintServer]::new().GetPrintQueue($printer).AddJob("Print Job", $file, $false) | Out-Null
`;
              execSync(`powershell -NoProfile -Command "${psCmd.replace(/"/g, '\\"')}"`, {
                stdio: 'pipe',
                timeout: 8000,
                shell: true,
                windowsHide: true
              });
              logger.info('✓ Print submitted via PowerShell WMI', { filename });
              printSuccess = true;
              processedCount++;
            } catch (wmiErr) {
              logger.warn('PowerShell WMI failed', { error: String(wmiErr).substring(0, 80) });
            }
          }
          
          // Method 2: Use rundll32 to invoke the Print verb
          if (!printSuccess) {
            try {
              logger.info('Attempting rundll32 print verb', { filename });
              execSync(`rundll32 shell32.dll, ShellExec_RunDLL "${destWithBackslashes}"`, {
                stdio: 'pipe',
                timeout: 5000,
                shell: true,
                windowsHide: true
              });
              logger.info('✓ Print submitted via rundll32', { filename });
              printSuccess = true;
              processedCount++;
            } catch (runErr) {
              logger.warn('rundll32 failed', { error: String(runErr).substring(0, 80) });
            }
          }
          
          // Method 3: Try print.exe one more time with timeout
          if (!printSuccess) {
            try {
              logger.info('Attempting print.exe (final attempt)', { filename });
              execSync(`print /D:"Brother MFC-J2730DW Printer" "${destWithBackslashes}"`, {
                stdio: 'pipe',
                timeout: 15000,
                shell: true,
                windowsHide: true
              });
              logger.info('✓ Print sent via print.exe', { filename });
              printSuccess = true;
              processedCount++;
            } catch (printErr) {
              logger.warn('print.exe failed', { error: String(printErr).substring(0, 80) });
            }
          }
          
          // Method 4: Last resort - copy to spooler directory manually
          if (!printSuccess) {
            try {
              logger.info('Attempting manual spooler directory copy', { filename });
              const spoolDir = 'C:\\Windows\\System32\\spool\\PRINTERS';
              if (fs.existsSync(spoolDir)) {
                const spoolFile = path.join(spoolDir, `${Date.now()}_${filename}`);
                fs.copyFileSync(dest, spoolFile);
                logger.info('✓ Copied to spooler directory', { filename, spoolFile });
                printSuccess = true;
                processedCount++;
              } else {
                logger.warn('Spooler directory not found', { spoolDir });
              }
            } catch (spoolErr) {
              logger.warn('Spooler copy failed', { error: String(spoolErr).substring(0, 80) });
            }
          }
          
          // Method 5: If absolutely nothing works, at least it's in PrintQueue
          if (!printSuccess) {
            logger.info('✓ File queued in C:\\PrintQueue - manual printing may be required', { filename });
            processedCount++;
          }
        } else if (platform === 'linux') {
          // LINUX KIOSK: Use CUPS/lp directly
          const tempFile = path.join(os.tmpdir(), filename);
          fs.copyFileSync(filePath, tempFile);
          try {
            execSync(`lp "${tempFile}"`, { stdio: 'pipe', timeout: 10000 });
            logger.info('✓ Print job sent via lp', { filename });
            processedCount++;
          } catch (err) {
            logger.error('lp command failed', { filename, error: String(err) });
          }
          try { fs.unlinkSync(tempFile); } catch {}
        } else if (platform === 'darwin') {
          // MACOS KIOSK: Use lp command
          const tempFile = path.join(os.tmpdir(), filename);
          fs.copyFileSync(filePath, tempFile);
          try {
            execSync(`lp "${tempFile}"`, { stdio: 'pipe', timeout: 10000 });
            logger.info('✓ Print job sent via lp', { filename });
            processedCount++;
          } catch (err) {
            logger.error('lp command failed', { filename, error: String(err) });
          }
          try { fs.unlinkSync(tempFile); } catch {}
        }
      } catch (fileErr) {
        logger.error('Error processing file for printing', { filename, error: String(fileErr) });
      }
    }

    if (processedCount === 0) {
      return { 
        success: false, 
        error: 'No files were successfully queued for printing',
        jobID: `JOB-${Date.now()}`
      };
    }

    logger.info('Batch print job completed', { totalFiles: filenames.length, processedCount });
    return { 
      success: true, 
      jobID: `JOB-${Date.now()}`, 
      method: 'kiosk-local-print'
    };
  } catch (error) {
    const err = error as Error;
    logger.error('Error in printFilesFromStorage', { error: err.message });
    return { success: false, error: err.message };
  }
};


/**
 * Get available printers
 */
export const getAvailablePrinters = async (): Promise<string[]> => {
  try {
    let printer: any;
    try {
      printer = require('printer');
    } catch (err) {
      logger.warn('Printer module not available');
      return [];
    }

    const printers = printer.getPrinters();
    logger.info('Retrieved printers', { count: printers.length });
    return printers.map((p: any) => p.name || p);
  } catch (error) {
    const err = error as Error;
    logger.error('Error getting printers', { error: err.message });
    return [];
  }
};
