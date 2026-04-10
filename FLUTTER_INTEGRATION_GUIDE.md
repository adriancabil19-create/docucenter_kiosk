# Flutter-Backend Integration Guide

This document describes how the Flutter application integrates with the Node.js/Express backend to process PAYMONGO payments.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Components](#components)
3. [Setup Instructions](#setup-instructions)
4. [Configuration](#configuration)
5. [Payment Flow](#payment-flow)
6. [Error Handling](#error-handling)
7. [Testing](#testing)
8. [Deployment](#deployment)

---

## Architecture Overview

The DOCUCENTER Kiosk application uses a client-server architecture with a Flutter frontend and Node.js backend:

```
┌─────────────────────┐
│   Flutter App       │
│  (Web/Mobile/       │
│   Desktop)          │
└──────────┬──────────┘
           │
           │ HTTP REST API
           │ (PAYMONGO Payment)
           │
┌──────────▼──────────┐
│   Node.js Backend   │
│   (Express.js)      │
└──────────┬──────────┘
           │
           │ PAYMONGO Merchant API
           │ (HTTPS)
           │
┌──────────▼──────────┐
│   PAYMONGO API         │
│   (Payment Gateway) │
└─────────────────────┘
```

## Components

### 1. **payment_service.dart**
Core payment service that handles all backend communication.

**Key Classes:**
- `PaymentTransaction` - Represents a payment with QR code
- `PaymentStatus` - Represents current payment status
- `PAYMONGOPaymentService` - Main service for API calls
- `PaymentPollingManager` - Manages status polling

**Methods:**
```dart
// Create a new payment transaction
createPayment({
  required double amount,
  String? serviceType,
  int documentCount = 1,
})

// Check payment status
checkPaymentStatus(String transactionId)

// Cancel a payment
cancelPayment(String transactionId, {String reason})

// Health check
healthCheck()
```

### 2. **config.dart**
Configuration settings for the application.

**Important Settings:**
- `BackendConfig.baseUrl` - Backend API base URL
- `PaymentConfig.pollingIntervalMs` - How often to check payment status
- `PaymentConfig.maxPaymentDurationSeconds` - Payment timeout

### 3. **services.dart** - PaymentInterface
Flutter widget that displays the payment UI and handles the payment flow.

**Features:**
- Displays QR code for PAYMONGO scanning
- Shows countdown timer
- Polls backend for payment status
- Handles success/failure/timeout scenarios
- Development tools for testing (simulation)

### 4. **pubspec.yaml** - Dependencies
```yaml
dependencies:
  http: ^1.1.0              # HTTP client for API calls
  qr_flutter: ^4.0.0        # QR code generation
```

---

## Setup Instructions

### Prerequisites
- Flutter SDK 3.10.8+
- Node.js 14+ (for backend)
- PAYMONGO test account (for development)

### Step 1: Backend Setup

See [backend/QUICKSTART.md](../backend/QUICKSTART.md) for detailed backend setup.

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Start development server
npm run dev
```

The backend should run on `http://localhost:5000`

### Step 2: Flutter Dependencies

```bash
# In the Flutter project root
flutter pub get
```

This will install:
- `http` - For making HTTP requests to backend
- `qr_flutter` - For displaying QR codes

### Step 3: Configure Backend URL

Edit `lib/config.dart` and update the backend URL:

```dart
class BackendConfig {
  static const String baseUrl = 'http://localhost:5000/api/PAYMONGO';
  // For web on different machine: http://192.168.1.100:5000/api/PAYMONGO
}
```

### Step 4: Run Flutter App

```bash
# For web
flutter run -d web

# For mobile/desktop (adjust as needed)
flutter run -d <device-id>
```

---

## Configuration

### Backend URL Configuration

The backend URL can be configured for different environments:

**Development:**
```dart
static const String baseUrl = 'http://localhost:5000/api/PAYMONGO';
```

**Staging:**
```dart
static const String baseUrl = 'https://staging-api.example.com/api/PAYMONGO';
```

**Production:**
```dart
static const String baseUrl = 'https://api.example.com/api/PAYMONGO';
```

### Payment Configuration

Adjust payment settings in `lib/config.dart`:

```dart
class PaymentConfig {
  // API request timeout
  static const int requestTimeoutSeconds = 30;

  // How often to check payment status
  static const int pollingIntervalMs = 3000;  // 3 seconds

  // Maximum time to wait for payment
  static const int maxPaymentDurationSeconds = 300;  // 5 minutes

  // Min/max payment amounts
  static const double minPaymentAmount = 1.00;
  static const double maxPaymentAmount = 100000.00;
}
```

### Enable/Disable Development Tools

In `lib/services.dart`, find the PaymentInterface class:

```dart
bool _showDevTools = true;  // Set to false in production
```

---

## Payment Flow

### Sequence Diagram

```
User           Flutter App         Backend         PAYMONGO
 │                 │                  │               │
 │─ Start Payment──>│                  │               │
 │                 │─ POST /create-payment──>│        │
 │                 │<─ Transaction + QR──────│        │
 │                 │                  │               │
 │<── Display QR ──│                  │               │
 │                 │─ Poll GET /check-payment─>│      │
 │ Scan QR & Pay   │                  │               │
 │ (PAYMONGO app)     │                  │ Webhook from PAYMONGO
 │                 │                  │<─ Payment status
 │                 │<─ Status update ─│               │
 │                 │                  │               │
 │<─ Success ---───│                  │               │
```

### Step-by-Step Flow

1. **Payment Creation**
   - User clicks "Print" and provides payment amount
   - App calls `PAYMONGOPaymentService.createPayment()`
   - Backend generates transaction ID and QR code
   - App displays QR code to user

2. **Payment Scanning**
   - User scans QR with PAYMONGO mobile app
   - PAYMONGO app displays payment details
   - User enters MPIN to confirm

3. **Status Polling**
   - App polls backend every 3 seconds
   - Backend checks PAYMONGO for payment status
   - Backend updates transaction status

4. **Success/Failure**
   - If successful: App shows success screen and proceeds with service
   - If failed: App shows error message and allows retry
   - If timeout: After 5 minutes, payment link expires

---

## Error Handling

### Exception Types

```dart
// Network-related errors
NetworkException('Failed to create payment')

// API errors
PaymentException('Payment processing failed', code: '400')

// Timeout errors
TimeoutException('Request took too long')
```

### Error Recovery

The app implements automatic retry logic:

1. **Failed Payment Creation**
   - Shows error message
   - Allows user to retry

2. **Lost Network Connection**
   - Shows network error message
   - Allows retry when connection restored

3. **Payment Timeout**
   - Cancels payment after 5 minutes
   - Shows timeout message
   - Allows user to create new payment

---

## Testing

### Development Mode

The app includes built-in testing tools when `_showDevTools = true`:

**Simulate Success:**
- Click "Simulate Success" button
- Payment status updates to SUCCESS
- App proceeds with service

**Simulate Failure:**
- Click "Simulate Failure" button
- Payment status updates to FAILED
- User can retry payment

### Manual Testing Checklist

- [ ] Backend is running on `http://localhost:5000`
- [ ] Flutter app can access backend URL
- [ ] Payment creation works
- [ ] QR code displays correctly
- [ ] Polling fetches status correctly
- [ ] Success simulation works
- [ ] Failure simulation works
- [ ] Timer counts down properly
- [ ] Cancel payment works
- [ ] Timeout after 5 minutes works

### Testing with Real PAYMONGO

1. Set real PAYMONGO credentials in backend `.env`
2. Disable development tools in `services.dart`
3. Test with real PAYMONGO test account
4. Monitor webhook logs in backend

---

## Deployment

### For Web Deployment

Edit `lib/config.dart`:

```dart
class BackendConfig {
  static const String baseUrl = 'https://api.yourdomain.com/api/PAYMONGO';
}
```

Build web app:

```bash
flutter build web --release
```

### For Mobile Deployment

Update backend URL for target environment:

```bash
flutter build apk --release          # Android
flutter build ios --release          # iOS
```

### Security Checklist

- [ ] Backend URL uses HTTPS in production
- [ ] CORS is properly configured
- [ ] API keys are secure
- [ ] Development tools are disabled
- [ ] Error messages don't expose sensitive data
- [ ] QR codes expire properly
- [ ] Rate limiting is enabled

---

## Troubleshooting

### Backend Connection Issues

**Problem:** "NetworkException: Failed to connect to backend"

**Solutions:**
1. Check backend is running: `npm run dev`
2. Verify backend URL in `config.dart`
3. For web on different machine: Use machine IP instead of localhost
4. Check firewall isn't blocking port 5000

### QR Code Not Displaying

**Problem:** QR code shows as blank or error

**Solutions:**
1. Verify `qr_flutter` package is installed
2. Check QR data is not too large
3. Ensure QR code image is in a bounded container

### Payment Status Not Updating

**Problem:** App keeps showing "pending" status

**Solutions:**
1. Check backend polling endpoint works
2. Verify polling interval setting
3. Check transaction ID is correct
4. Monitor backend logs for errors

### Timeout Errors

**Problem:** "TimeoutException: Request took too long"

**Solutions:**
1. Increase timeout in `PaymentConfig`
2. Check network connection
3. Verify backend is not overloaded
4. Check backend response times

---

## API Reference

See [backend/API_DOCUMENTATION.md](../backend/API_DOCUMENTATION.md) for complete API reference.

### Key Endpoints

- `POST /create-payment` - Create payment transaction
- `GET /check-payment/:id` - Check payment status
- `POST /cancel-payment/:id` - Cancel payment
- `GET /health` - Health check
- `POST /simulate/success/:id` - Dev: Simulate success
- `POST /simulate/failure/:id` - Dev: Simulate failure

---

## Support

For issues or questions:
1. Check backend logs: `npm run dev`
2. Check Flutter app console
3. Enable debug logging in `config.dart`
4. Review backend/API_DOCUMENTATION.md

---

**Last Updated:** February 2026

