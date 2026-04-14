# 🚀 Quick Start - PAYMONGO Backend

Your complete Node.js + Express backend is ready!

## ⚡ Get Started in 3 Minutes

```bash
# 1. Navigate to backend
cd backend

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example .env

# 4. Start development server
npm run dev
```

✅ Server running at `http://localhost:5000`

---

## 📋 What's Included

### Core Files
- **src/index.ts** - Express server initialization
- **src/services/PAYMONGO.ts** - PAYMONGO API integration
- **src/controllers/PAYMONGO.ts** - Request handlers
- **src/routes/PAYMONGO.ts** - API endpoints
- **src/middleware/index.ts** - Express middleware
- **src/types/index.ts** - TypeScript interfaces
- **src/utils/** - Configuration, helpers, logging

### Configuration
- **package.json** - Dependencies and scripts
- **tsconfig.json** - TypeScript configuration  
- **.env.example** - Environment template
- **.gitignore** - Git ignore rules

### Documentation
- **README.md** - Full documentation
- **API_DOCUMENTATION.md** - Detailed API reference
- **SETUP_GUIDE.md** - Deployment guide
- **example-client.tsx** - React integration example

### Deployment
- **Dockerfile** - Container configuration
- **docker-compose.yml** - Multi-container setup

---

## 🔌 API Endpoints

```
POST   /api/PAYMONGO/create-payment          Create payment
GET    /api/PAYMONGO/check-payment/:id       Check status
POST   /api/PAYMONGO/cancel-payment/:id      Cancel payment
POST   /api/PAYMONGO/webhook                 Handle webhook
GET    /api/PAYMONGO/health                  Health check
POST   /api/qr/verify                     Verify QR payload (Aiven/Postgres)
GET    /api/qr/health                     QR service health
```

---

## 🧪 Test It

### Test Payment Creation
```bash
curl -X POST http://localhost:5000/api/PAYMONGO/create-payment \
  -H "Content-Type: application/json" \
  -d '{"amount": 50, "serviceType": "print"}'
```

### Test Health Check
```bash
curl http://localhost:5000/health
```

### Development Testing
```bash
# Simulate successful payment
curl -X POST http://localhost:5000/api/PAYMONGO/simulate/success/TXN-xxx

# Simulate failed payment
curl -X POST http://localhost:5000/api/PAYMONGO/simulate/failure/TXN-xxx
```

---

## 📚 Scripts

```bash
npm run dev         # Start development server
npm run build       # Build TypeScript
npm start          # Start production server
npm test           # Run tests
npm run lint       # Lint code
```

---

## 🔐 Configuration

### Required Environment Variables

Set these in `.env`:

```env
PAYMONGO_MERCHANT_ID=your_merchant_id
PAYMONGO_API_KEY=your_api_key
PAYMONGO_SECRET_KEY=your_secret_key
PAYMONGO_WEBHOOK_SECRET=your_webhook_secret
FRONTEND_URL=http://localhost:3000
```

### Aiven / External DB (optional)

If you provision an Aiven PostgreSQL instance to hold QR verification records, set these in `.env`:

```env
AIVEN_DATABASE_URL=postgres://user:password@your-host:5432/dbname
AIVEN_DB_USER=your_user
AIVEN_DB_PASSWORD=your_password
AIVEN_REQUIRE_SSL=true
```

The backend will query a table named `qr_verifications` with columns `qr_code text` and `verified boolean`.

If `AIVEN_DATABASE_URL` is not set the server uses a development fallback (accepts non-empty QR strings).

Get credentials from [PAYMONGO Developer Portal](https://developer.PAYMONGO.com)

---

## 🚢 Deployment

### Docker
```bash
docker-compose up
```

### Heroku
```bash
heroku create your-app-name
heroku config:set PAYMONGO_MERCHANT_ID=xxx
git push heroku main
```

See [SETUP_GUIDE.md](./SETUP_GUIDE.md) for detailed deployment instructions.

---

## 🔗 Frontend Integration

Use the provided React hook:

```tsx
import { PaymentInterface } from './payment-client';

<PaymentInterface
  amount={50}
  onSuccess={(txnId) => console.log('Success:', txnId)}
  onFailure={(error) => console.log('Failed:', error)}
/>
```

See [example-client.tsx](./example-client.tsx) for complete example.

---

## 📖 Documentation

- 📘 [Full README](./README.md)
- 📕 [API Documentation](./API_DOCUMENTATION.md)
- 📗 [Setup & Deployment](./SETUP_GUIDE.md)
- 📙 [React Client Example](./example-client.tsx)

---

## 🆘 Help

### Common Issues

**Port 5000 already in use**
```bash
PORT=3001 npm run dev
```

**CORS errors**
- Verify `FRONTEND_URL` in `.env`
- Make sure `ENABLE_CORS=true`

**Webhook signature fails**
- Double-check `PAYMONGO_WEBHOOK_SECRET`
- Verify payload integrity

---

## 🎯 Next Steps

1. ✅ Configure `.env` with credentials
2. ✅ Start development server
3. ✅ Test API endpoints
4. ✅ Integrate frontend with client code
5. ✅ Deploy to production

---

## ✨ Features

✅ PAYMONGO payment integration  
✅ QR code generation  
✅ Webhook handling  
✅ HMAC-SHA256 signature verification  
✅ Rate limiting (100 req/15 min)  
✅ CORS support  
✅ Error handling  
✅ TypeScript throughout  
✅ Docker ready  
✅ Production ready  

---

## 🤝 Support

For help:
1. Check the documentation files
2. Review error logs: `npm run dev | grep ERROR`
3. Test with provided cURL examples
4. Check environment variables: `echo $PAYMONGO_MERCHANT_ID`

---

**Happy Coding! 🎉**

Backend Version: 1.0.0  
Architecture: Node.js + Express + TypeScript  
Status: ✅ Production Ready

---

Need help? Read the [full documentation](./README.md)

