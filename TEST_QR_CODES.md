# Test QR Codes - PayMongo QR Ph

## Official QR Ph Test Code

**Merchant Account:** CHARLES ADRIAN LAURETO CA  
**QR Code ID:** `code_8T7GbSP9ztU2tQUJ5WQyJ5Cn`  
**Payment Method:** QR Ph (QR Ph - Scan na All!)  
**Supported Channels:**
- Banks (BPI, UnionBank, Metrobank, PNB, and more)
- E-Wallets
- And More

**Status:** ✅ Connected to PayMongo  
**Date Added:** 2026-04-09

### How to Use
1. Use this QR code for testing payment flows in the Flutter kiosk application
2. Scan with any supported bank or e-wallet app
3. Complete test transactions to verify webhook integration
4. Monitor backend logs to confirm payment status updates

### Testing Workflow
1. Start backend: `cd backend && npm run dev`
2. Start ngrok tunnel: `npx ngrok http 5000`
3. Configure PayMongo webhook: `https://shea-loamy-hygrometrically.ngrok-free.dev/api/payment/qrph/webhook`
4. Launch Flutter app: `flutter run` (Windows)
5. Navigate to Payment page and initiate QR Ph payment
6. Scan the official QR code with your banking app
7. Complete payment
8. Verify webhook received and payment status updated

### QR Code Image
The QR code image is stored in the project attachments and linked in this document.

---

**Last Updated:** 2026-04-09  
**Ready for Testing:** Yes
