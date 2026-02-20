# Web Doc Backend - GCash Payment Integration

Complete Node.js + Express backend for the Web Doc Kiosk payment system with GCash integration.

## 🚀 Quick Start

### Prerequisites
- Node.js 14+ or higher
- npm or yarn
- GCash Merchant Account credentials

### Installation

```bash
# Install dependencies
npm install

# Create environment configuration
cp .env.example .env
```

### Configuration

Edit `.env` with your GCash credentials:

```env
# GCash Configuration
GCASH_MERCHANT_ID=your_merchant_id
GCASH_API_KEY=your_api_key
GCASH_SECRET_KEY=your_secret_key
GCASH_WEBHOOK_SECRET=your_webhook_secret

# Frontend URL
FRONTEND_URL=http://localhost:3000
```

### Development

```bash
# Start development server with auto-reload
npm run dev

# Server will start on http://localhost:5000
```

### Build & Production

```bash
# Build TypeScript
npm run build

# Start production server
npm start
```

---

## 📡 API Endpoints

### 1. Create Payment
**POST** `/api/gcash/create-payment`

Request:
```json
{
  "amount": 100,
  "serviceType": "print",
  "documentCount": 5,
  "description": "Print service"
}
```

Response:
```json
{
  "data": {
    "transactionId": "TXN-1707386400000-ABC123",
    "referenceNumber": "REF-1707386400000-XYZ789",
    "qrCode": "base64-encoded-qr-content",
    "expiresIn": 300
  },
  "status": "success",
  "message": "Payment created successfully"
}
```

### 2. Check Payment Status
**GET** `/api/gcash/check-payment/:transactionId`

Response:
```json
{
  "success": true,
  "data": {
    "status": "PENDING",
    "transactionId": "TXN-1707386400000-ABC123",
    "referenceNumber": "REF-1707386400000-XYZ789",
    "amount": 100,
    "completedAt": null
  },
  "message": "Payment status retrieved successfully"
}
```

### 3. Cancel Payment
**POST** `/api/gcash/cancel-payment/:transactionId`

Request:
```json
{
  "reason": "User cancelled"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "transactionId": "TXN-1707386400000-ABC123"
  },
  "message": "Payment cancelled successfully"
}
```

### 4. Webhook Handler
**POST** `/api/gcash/webhook`

Headers:
```
X-Webhook-Signature: <HMAC-SHA256 signature>
```

Payload:
```json
{
  "eventType": "payment.success",
  "transactionId": "TXN-1707386400000-ABC123",
  "referenceNumber": "REF-1707386400000-XYZ789",
  "status": "SUCCESS",
  "amount": 100,
  "timestamp": "2026-02-08T10:00:00Z"
}
```

### 5. Health Check
**GET** `/api/gcash/health`

Response:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-02-08T10:00:00Z",
    "uptime": 3600,
    "gcashApi": "connected"
  },
  "message": "Server is healthy"
}
```

---

## 🧪 Testing & Simulation Endpoints

### Simulate Payment Success
**POST** `/api/gcash/simulate/success/:transactionId`

*Development mode only*

### Simulate Payment Failure
**POST** `/api/gcash/simulate/failure/:transactionId`

Body:
```json
{
  "reason": "Insufficient funds"
}
```

*Development mode only*

---

## 🏗️ Project Structure

```
backend/
├── src/
│   ├── controllers/
│   │   └── gcash.ts          # Request handlers
│   ├── services/
│   │   └── gcash.ts          # Business logic & GCash API
│   ├── routes/
│   │   └── gcash.ts          # Route definitions
│   ├── middleware/
│   │   └── index.ts          # Express middleware
│   ├── types/
│   │   └── index.ts          # TypeScript interfaces
│   ├── utils/
│   │   ├── config.ts         # Configuration management
│   │   ├── helpers.ts        # Utility functions
│   │   └── logger.ts         # Logging utility
│   └── index.ts              # Express server
├── dist/                      # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
├── .env.example
└── .gitignore
```

---

## 🔐 Security Features

### Implemented
- ✅ CORS protection with whitelist
- ✅ Helmet.js security headers
- ✅ Rate limiting (100 req/15 min)
- ✅ HMAC-SHA256 webhook signature verification
- ✅ Environment variable encryption
- ✅ Input validation
- ✅ Error sanitization
- ✅ Request logging

### Best Practices
- All sensitive credentials in `.env` (never commit)
- HTTPS enforced in production
- Webhook signature verification mandatory
- Request/response validation with TypeScript
- Security headers (XSS, CSRF, Clickjacking protection)
- Rate limiting prevents abuse

---

## 📊 Data Flow

```
Frontend (React)
    ↓
POST /api/gcash/create-payment
    ↓
GCash Service (In-Memory Storage)
    ↓
Return Transaction ID + QR Code
    ↓
Frontend polls GET /api/gcash/check-payment/:id
    ↓
GCash Webhook → POST /api/gcash/webhook
    ↓
Transaction Status Updated
    ↓
Frontend detects SUCCESS → Print Job Starts
```

---

## 🔄 Payment Status Lifecycle

```
PENDING → PROCESSING → SUCCESS
                    ↓ (error)
                    FAILED
                    
PENDING → EXPIRED (if timeout)
PENDING → CANCELLED (if user cancels)
```

---

## 🚨 Error Handling

All endpoints return standard error responses:

```json
{
  "success": false,
  "error": "Error code",
  "message": "Human readable message",
  "details": "Stack trace (development only)"
}
```

### Common HTTP Status Codes
- `200`: Success
- `201`: Resource created
- `400`: Bad request / validation error
- `401`: Unauthorized / invalid signature
- `404`: Not found
- `429`: Too many requests (rate limited)
- `500`: Internal server error
- `503`: Service unavailable

---

## 🔧 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NODE_ENV` | Environment (development/production) | No |
| `PORT` | Server port | No (default: 5000) |
| `FRONTEND_URL` | Frontend origin for CORS | Yes |
| `GCASH_MERCHANT_ID` | GCash merchant ID | Yes |
| `GCASH_API_KEY` | GCash API key | Yes |
| `GCASH_SECRET_KEY` | GCash secret key | Yes |
| `GCASH_WEBHOOK_SECRET` | Webhook secret for verification | Yes |
| `PAYMENT_TIMEOUT_SECONDS` | Payment expiration | No (default: 300) |
| `LOG_LEVEL` | Logging level (error/warn/info/debug) | No (default: info) |

---

## 📦 Dependencies

### Production
- **express**: Web framework
- **axios**: HTTP client
- **cors**: CORS middleware
- **helmet**: Security headers
- **express-rate-limit**: Rate limiting
- **body-parser**: Request body parsing
- **dotenv**: Environment configuration

### Development
- **typescript**: Language
- **ts-node**: Typescript runtime
- **@types/***: Type definitions
- **eslint**: Linting
- **jest**: Testing

---

## 🧹 Code Quality

```bash
# Lint code
npm run lint

# Run tests
npm test
```

---

## 📈 Deployment

### Heroku

```bash
# Login
heroku login

# Create app
heroku create web-doc-backend

# Set environment variables
heroku config:set GCASH_MERCHANT_ID=xxx
heroku config:set GCASH_API_KEY=xxx
# ... set other variables

# Deploy
git push heroku main

# View logs
heroku logs --tail
```

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .
RUN npm run build

EXPOSE 5000

CMD ["npm", "start"]
```

### Docker Compose

See `docker-compose.yml` in project root.

---

## 📝 Logging

Logs are output to console with timestamps:

```
[2026-02-08T10:00:00.000Z] [INFO] Payment created | {"transactionId":"TXN-...", "amount": 100}
```

Set `LOG_LEVEL` environment variable:
- `error`: Errors only
- `warn`: Warnings and errors
- `info`: Info, warnings, and errors (default)
- `debug`: All including debug messages

---

## 🔗 Frontend Integration

```typescript
// React component example
const response = await fetch('http://localhost:5000/api/gcash/create-payment', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    amount: 100,
    serviceType: 'print',
    documentCount: 5,
  }),
});

const { data } = await response.json();
// Use data.qrCode and data.transactionId
```

---

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Find process on port 5000
lsof -i :5000

# Kill it
kill -9 <PID>

# Or change port
PORT=3001 npm run dev
```

### CORS Errors
Ensure `FRONTEND_URL` matches your frontend origin exactly.

### Webhook Verification Fails
1. Check `GCASH_WEBHOOK_SECRET` is correct
2. Verify payload is not modified
3. Check request headers for signature

### Rate Limit Exceeded
Wait 15 minutes or adjust `RATE_LIMIT_WINDOW_MS` in `.env`

---

## 📞 Support & Documentation

- **GCash Merchant API**: https://developer.gcash.com
- **Express.js Docs**: https://expressjs.com
- **TypeScript Guide**: https://www.typescriptlang.org/docs/

---

## 📄 License

MIT License - See LICENSE file

---

**Version**: 1.0.0  
**Last Updated**: February 8, 2026  
**Status**: Production Ready (Demo Mode Active)
