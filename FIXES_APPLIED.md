# Bug Fixes Applied - Color Mode & Paper Tracking

## Overview
Fixed two critical bugs in the document kiosk system:
1. **Color Mode Settings Issue**: Print settings were not being passed to the print service
2. **Paper Tracking Decrement Issue**: Paper usage wasn't being tracked after printing

---

## Fix 1: Color Mode Settings Not Applied

### Problem
Users could select color mode (B&W or Color) in the UI, but the printer was ignoring these settings and always printing in default mode.

### Root Cause
The `printFromStorage()` method in the Flutter app was calling the backend API but **not passing the color mode and quality parameters**. Additionally, the backend print service wasn't accepting or using these parameters.

### Changes Made

#### Backend: `backend/src/services/print.service.ts`

**1. Updated PrintOptions Interface**
```typescript
interface PrintOptions {
  type?: string;
  printerName?: string;
  paperSize?: string; // 'A4' | 'Folio' | 'Letter'
  colorMode?: string; // 'bw' | 'color'
  quality?: string;   // 'draft' | 'standard' | 'high'
}
```

**2. Fixed buildSettings Function**
Changed from `'bw'` to `'color=no'` for proper SumatraPDF color mode:
```typescript
const buildSettings = (): string => {
  const parts: string[] = [];
  if (paperSize) parts.push(`paper=${paperSize.toLowerCase()}`);
  if (colorMode === 'bw') parts.push('color=no');  // Fixed: was 'bw'
  if (quality === 'high') parts.push('nHires');
  else if (quality === 'draft') parts.push('draft');
  return parts.join(',');
};
```

**3. Updated printText() Method**
Now accepts and passes colorMode and quality:
```typescript
export const printText = async (
  text: string,
  options?: Partial<PrintOptions>,
): Promise<PrintResult> => {
  const jobID = `JOB-${Date.now()}`;
  const paperSize = options?.paperSize ?? 'A4';
  const colorMode = options?.colorMode;    // NEW
  const quality = options?.quality;         // NEW
  
  // ... then pass these to printPdfFile()
  const result = await printPdfFile(tempPdf, jobID, paperSize, colorMode, quality);
```

**4. Updated All printPdfFile() Calls**
Updated in three locations to pass colorMode and quality:
- In `printText()` method
- In `printFromStorage()` - PDF handling
- In `printFromStorage()` - Image handling
- In `printFromStorage()` - Text file handling

#### Frontend: `lib/pages/printing_page.dart`

The Flutter UI already had the color mode selection dropdown correctly implemented. The issue was only on the backend side.

### Verification
✅ Backend builds successfully with new parameters
✅ Flutter builds successfully
✅ All printPdfFile() calls now include colorMode and quality parameters

---

## Fix 2: Paper Tracking Not Decrementing

### Problem
After printing, the paper tray counts were not decreasing, so paper tracking showed incorrect inventory levels.

### Root Cause
The paper decrement logic was **only implemented for `printFromStorage()`** but **missing from the other print routes** like:
- `POST /print/text` - for text printing
- `POST /print/scan` - for scanned document printing

### Changes Made

#### Backend: `backend/src/routes/print.ts`

**Updated `/print/text` endpoint** to track paper usage:
```typescript
router.post('/print/text', async (req, res) => {
  // ... existing code ...
  if (result.success) {
    // Track paper usage
    const pageCount = Math.ceil(text.length / CHARS_PER_PAGE);
    const trayName = req.body.paperSize === 'A4' ? 'A4' : 'Folio';
    try {
      const decremented = await PaperTrackerService.usePaper(trayName, pageCount);
      logger.info('Paper usage tracked', { trayName, pageCount, decremented });
    } catch (trackErr) {
      logger.error('Failed to track paper usage', { error: String(trackErr) });
    }
  }
  res.json(result);
});
```

**Updated `/print/scan` endpoint** to track paper usage:
```typescript
router.post('/print/scan', async (req, res) => {
  // ... existing code ...
  
  if (printSuccessful) {
    // Track paper usage
    const trayName = req.body.paperSize === 'A4' ? 'A4' : 'Folio';
    try {
      const decremented = await PaperTrackerService.usePaper(trayName, filesCount);
      logger.info('Paper usage tracked for scanned docs', { trayName, pages: filesCount, decremented });
    } catch (trackErr) {
      logger.error('Failed to track paper usage', { error: String(trackErr) });
    }
  }
  res.json({ success: printSuccessful, jobID });
});
```

### Implementation Details

**Paper Tracking Logic:**
- When printing succeeds, calculate the number of pages used
- Call `PaperTrackerService.usePaper(trayName, pageCount)`
- Log the result for debugging
- Handle errors gracefully without failing the print operation

**Page Counting:**
- Text: `Math.ceil(text.length / CHARS_PER_PAGE)` where CHARS_PER_PAGE = 2400
- PDFs: Count from PDF metadata
- Images: 1 page per image
- Scanned documents: Use count from scan operation

### Verification
✅ Backend builds successfully
✅ Paper decrement logic now applies to all print routes
✅ Error handling prevents print failures if paper tracking fails
✅ Logging added for debugging paper tracking issues

---

## Testing Recommendations

### Color Mode Testing
1. Select **B&W mode** and print a color PDF → should print in black & white only
2. Select **Color mode** and print → should print in full color
3. Verify printer settings show correct color/monochrome configuration

### Paper Tracking Testing
1. **Check initial paper levels** via Paper Tracker page
2. **Print using each route:**
   - Text printing: Use `/print/text`
   - PDF printing: Use `/from-storage`
   - Scanned docs: Use scan + print flow
3. **Verify paper counts decrease** by the correct amount after each print
4. **Check backend logs** for paper tracking entries

### Expected Log Output
```
Paper usage tracked: { trayName: 'A4', pageCount: 5, decremented: true }
```

---

## Files Modified

1. `backend/src/services/print.service.ts`
   - Updated PrintOptions interface
   - Fixed buildSettings() function
   - Updated printText() method signature
   - All printPdfFile() calls now include colorMode and quality

2. `backend/src/routes/print.ts`
   - Added paper tracking to `/print/text` endpoint
   - Added paper tracking to `/print/scan` endpoint
   - Existing `/from-storage` already had paper tracking

---

## Build Status
- ✅ Backend: `npm run build` - Success
- ✅ Flutter: `flutter build windows --debug` - Success

---

## Next Steps
If paper tracking still isn't working after these fixes:
1. Check backend logs in real-time during printing
2. Verify that PaperTrackerService.usePaper() is being called
3. Test the `/paper-trays/:trayName/use` endpoint directly
4. Check if there are JavaScript/TypeScript errors in browser console
