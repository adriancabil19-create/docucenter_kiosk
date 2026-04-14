# API Documentation - PAYMONGO Payment Integration

Complete API reference for the Web Doc Backend payment system.

## Base URL

```
Development: http://localhost:5000
Production: https://api.webdoc.com
```

## Authentication

The API uses the following authentication methods:

1. **API Key** (in headers for webhook calls)
2. **Webhook Signature** (HMAC-SHA256 verification)

---

## Endpoints Overview

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| POST | `/api/PAYMONGO/create-payment` | Create new payment | No |
| GET | `/api/PAYMONGO/check-payment/:id` | Check payment status | No |
| POST | `/api/PAYMONGO/cancel-payment/:id` | Cancel payment | No |
| POST | `/api/PAYMONGO/webhook` | Receive PAYMONGO webhooks | Signature |
| GET | `/api/PAYMONGO/health` | Server health check | No |
| POST | `/api/PAYMONGO/simulate/success/:id` | Test success (dev only) | No |
| POST | `/api/PAYMONGO/simulate/failure/:id` | Test failure (dev only) | No |

---

## Response Format

All responses follow this structure:

### Success Response
```json
{
  "success": true,
  "data": {
    "key": "value"
  },
  "message": "Operation successful"
}
```

### Error Response
```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human readable error message",
  "details": "Stack trace (development only)"
}
```

---

## Detailed Endpoint Documentation

### 1. Create Payment

Creates a new PAYMONGO payment transaction and returns QR code for user to scan.

**Request**
```http
POST /api/PAYMONGO/create-payment HTTP/1.1
Content-Type: application/json

{
  "amount": 50.00,
  "serviceType": "print",
  "documentCount": 5,
  "description": "Print 5 pages",
  "metadata": {
    "customField": "customValue"
  }
}
```

**Parameters**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `amount` | number | Yes | Payment amount in PHP | 50.00 |
| `serviceType` | string | No | Type of service | "print", "scan", "copy" |
| `documentCount` | number | No | Number of documents | 5 |
| `description` | string | No | Payment description | "Print service" |
| `metadata` | object | No | Custom metadata | {} |

**Response**
```json
{
  "data": {
    "transactionId": "TXN-1707386400000-ABC123",
    "referenceNumber": "REF-1707386400000-XYZ789",
    "qrCode": "eyJhbGciOiJIUzI1NiIsInR5cCI...",
    "expiresIn": 300
  },
  "status": "success",
  "message": "Payment created successfully"
}
```

**Response Fields**

| Field | Type | Description |
|-------|------|-------------|
| `transactionId` | string | Unique transaction identifier |
| `referenceNumber` | string | Reference number for user |
| `qrCode` | string | Base64-encoded QR code content |
| `expiresIn` | number | Seconds until payment expires |

**Status Codes**
- `201`: Payment created successfully
- `400`: Validation error (invalid amount, missing fields)
- `500`: Server error

**Example cURL**
```bash
curl -X POST http://localhost:5000/api/PAYMONGO/create-payment \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 50.00,
    "serviceType": "print",
    "documentCount": 5
  }'
```

---

### 2. Check Payment Status

Poll this endpoint to check payment status after QR display.

**Request**
```http
GET /api/PAYMONGO/check-payment/TXN-1707386400000-ABC123 HTTP/1.1
```

**Parameters**

| Field | Type | Location | Description |
|-------|------|----------|-------------|
| `transactionId` | string | URL path | Transaction ID from create-payment |

**Response**
```json
{
  "success": true,
  "data": {
    "status": "PENDING",
    "transactionId": "TXN-1707386400000-ABC123",
    "referenceNumber": "REF-1707386400000-XYZ789",
    "amount": 50.00,
    "completedAt": null
  },
  "message": "Payment status retrieved successfully"
}
```

**Status Values**

| Status | Description | Next Action |
|--------|-------------|------------|
| `PENDING` | Waiting for payment | Keep polling |
| `PROCESSING` | Payment being verified | Keep polling |
| `SUCCESS` | Payment confirmed | Proceed to print/service |
| `FAILED` | Payment declined | Show error, allow retry |
| `EXPIRED` | Payment timed out | Create new payment |
| `CANCELLED` | Payment cancelled | Create new payment |

**Status Codes**
- `200`: Status retrieved
- `404`: Transaction not found
- `500`: Server error

**Polling Strategy**
```javascript
const pollInterval = setInterval(async () => {
  const response = await fetch(`/api/PAYMONGO/check-payment/${transactionId}`);
  const { data } = await response.json();
  
  if (data.status === 'SUCCESS') {
    clearInterval(pollInterval);
    // Start printing
  } else if (data.status === 'FAILED' || data.status === 'EXPIRED') {
    clearInterval(pollInterval);
    // Show error, create new payment
  }
}, 3000); // Poll every 3 seconds
```

---

### 3. Cancel Payment

Cancel a pending or processing payment.

**Request**
```http
POST /api/PAYMONGO/cancel-payment/TXN-1707386400000-ABC123 HTTP/1.1
Content-Type: application/json

{
  "reason": "User cancelled"
}
```

**Parameters**

| Field | Type | Location | Description |
|-------|------|----------|-------------|
| `transactionId` | string | URL path | Transaction ID to cancel |
| `reason` | string | Body | Cancellation reason (optional) |

**Response**
```json
{
  "success": true,
  "data": {
    "transactionId": "TXN-1707386400000-ABC123"
  },
  "message": "Payment cancelled successfully"
}
```

**Status Codes**
- `200`: Cancelled successfully
- `400`: Cannot cancel (wrong status)
- `404`: Transaction not found
- `500`: Server error

**Cancellable States**
Only `PENDING` and `PROCESSING` payments can be cancelled.

---

### 4. Webhook Handler

Receives payment status updates from PAYMONGO API.

**Request** (from PAYMONGO)
```http
POST /api/PAYMONGO/webhook HTTP/1.1
Content-Type: application/json
X-Webhook-Signature: abcdef123456...

{
  "eventType": "payment.completed",
  "transactionId": "TXN-1707386400000-ABC123",
  "referenceNumber": "REF-1707386400000-XYZ789",
  "status": "SUCCESS",
  "amount": 50.00,
  "timestamp": "2026-02-08T10:30:00Z"
}
```

**Headers**

| Header | Description | Required |
|--------|-------------|----------|
| `X-Webhook-Signature` | HMAC-SHA256 signature | Yes |
| `Content-Type` | application/json | Yes |

**Signature Verification**

```typescript
const crypto = require('crypto');

const signature = crypto
  .createHmac('sha256', process.env.PAYMONGO_WEBHOOK_SECRET)
  .update(payloadString)
  .digest('hex');

const isValid = signature === receivedSignature;
```

**Payload Fields**

| Field | Type | Description |
|-------|------|-------------|
| `eventType` | string | Type of event |
| `transactionId` | string | Transaction ID |
| `referenceNumber` | string | Reference number |
| `status` | string | Payment status |
| `amount` | number | Payment amount |
| `timestamp` | string | ISO timestamp |

**Response**
```json
{
  "success": true,
  "message": "Webhook processed successfully"
}
```

**Status Codes**
- `200`: Webhook processed
- `401`: Invalid signature
- `404`: Transaction not found
- `500`: Processing error

**Webhook Events**

| Event | Payload | Action |
|-------|---------|--------|
| `payment.completed` | status: SUCCESS | Start service |
| `payment.failed` | status: FAILED | Show error |
| `payment.expired` | status: EXPIRED | Require new payment |
| `payment.cancelled` | status: CANCELLED | Allow retry |

---

### 5. Health Check

Check server and PAYMONGO API connectivity.

**Request**
```http
GET /api/PAYMONGO/health HTTP/1.1
```

**Response**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-02-08T10:30:00Z",
    "uptime": 3600,
    "PAYMONGOApi": "connected"
  },
  "message": "Server is healthy"
}
```

**Status Values**

| Value | Meaning |
|-------|---------|
| `healthy` | All systems operational |
| `degraded` | Some services down |
| `unhealthy` | Service unavailable |

**Status Codes**
- `200`: Healthy
- `503`: Unhealthy

---

### 6. Simulate Payment Success (Dev Only)

For testing - mark payment as successful.

**Request**
```http
POST /api/PAYMONGO/simulate/success/TXN-1707386400000-ABC123 HTTP/1.1
```

**Response**
```json
{
  "success": true,
  "data": {
    "transactionId": "TXN-1707386400000-ABC123"
  },
  "message": "Payment simulated as successful"
}
```

**Requirements**
- `NODE_ENV` must be `development`
- Does NOT work in production

---

### 7. Simulate Payment Failure (Dev Only)

For testing - mark payment as failed.

**Request**
```http
POST /api/PAYMONGO/simulate/failure/TXN-1707386400000-ABC123 HTTP/1.1
Content-Type: application/json

{
  "reason": "Insufficient funds"
}
```

**Response**
```json
{
  "success": true,
  "data": {
    "transactionId": "TXN-1707386400000-ABC123"
  },
  "message": "Payment simulated as failed"
}
```

**Requirements**
- `NODE_ENV` must be `development`
- Does NOT work in production

---

## Error Codes

| Code | HTTP | Description | Action |
|------|------|-------------|--------|
| `INVALID_AMOUNT` | 400 | Amount is outside acceptable range | Retry with valid amount |
| `INVALID_CURRENCY` | 400 | Unsupported currency | Use PHP |
| `MISSING_FIELD` | 400 | Required field missing | Check request body |
| `TRANSACTION_NOT_FOUND` | 404 | Transaction doesn't exist | Create new payment |
| `INVALID_STATUS` | 400 | Cannot perform action on current status | Wait for status change |
| `INVALID_SIGNATURE` | 401 | Webhook signature verification failed | Verify secret key |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Wait 15 minutes |
| `INTERNAL_ERROR` | 500 | Server error | Retry or contact support |
| `PAYMONGO_API_ERROR` | 503 | PAYMONGO service unavailable | Retry later |

---

## Rate Limiting

- **Limit**: 100 requests per 15 minutes
- **Header**: `X-RateLimit-Remaining`
- **Status**: `429` when exceeded
- **Reset**: Automatically after window expires

---

## CORS Configuration

**Allowed Origins**
Configured via `FRONTEND_URL` environment variable

**Allowed Methods**
- GET
- POST
- PUT
- DELETE
- OPTIONS

**Allowed Headers**
- Content-Type
- Authorization
- X-Webhook-Signature

**Credentials**
Enabled if `CORS_CREDENTIALS=true`

---

## Timestamps

All timestamps are in **ISO 8601 UTC format**:
```
2026-02-08T10:30:00Z
```

---

## Examples

### Complete Payment Flow

```javascript
// 1. Create payment
const createResponse = await fetch('/api/PAYMONGO/create-payment', {
  method: 'POST',
  body: JSON.stringify({
    amount: 50,
    serviceType: 'print'
  })
});
const { data: payment } = await createResponse.json();

// 2. Display QR code
displayQRCode(payment.qrCode);

// 3. Poll for payment
let paymentConfirmed = false;
const checkInterval = setInterval(async () => {
  const statusResponse = await fetch(
    `/api/PAYMONGO/check-payment/${payment.transactionId}`
  );
  const { data: status } = await statusResponse.json();
  
  if (status.status === 'SUCCESS') {
    clearInterval(checkInterval);
    paymentConfirmed = true;
    startPrinting();
  }
}, 3000);

// 4. Handle cancellation
async function cancelPayment() {
  await fetch(
    `/api/PAYMONGO/cancel-payment/${payment.transactionId}`,
    { method: 'POST' }
  );
}
```

---

## Testing with cURL

```bash
# Create payment
curl -X POST http://localhost:5000/api/PAYMONGO/create-payment \
  -H "Content-Type: application/json" \
  -d '{"amount": 50, "serviceType": "print"}'

# Check status
curl http://localhost:5000/api/PAYMONGO/check-payment/TXN-xxx

# Cancel payment
curl -X POST http://localhost:5000/api/PAYMONGO/cancel-payment/TXN-xxx

# Health check
curl http://localhost:5000/api/PAYMONGO/health

# Simulate success (dev only)
curl -X POST http://localhost:5000/api/PAYMONGO/simulate/success/TXN-xxx
```

---

## Support

For issues or questions:
1. Check logs: `npm run dev | grep ERROR`
2. Verify `.env` configuration
3. Check PAYMONGO API documentation
4. Review error messages and codes

---

**Document Version**: 1.0.0  
**Last Updated**: February 8, 2026

