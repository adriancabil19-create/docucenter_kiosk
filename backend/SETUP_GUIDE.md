# Setup Guide - GCash Payment Integration Backend

Complete setup and deployment guide for the Web Doc Backend.

---

## Table of Contents

1. [Local Development Setup](#local-development-setup)
2. [Environment Configuration](#environment-configuration)
3. [Running the Server](#running-the-server)
4. [Testing](#testing)
5. [Docker Deployment](#docker-deployment)
6. [Production Deployment](#production-deployment)
7. [Troubleshooting](#troubleshooting)

---

## Local Development Setup

### Prerequisites

- **Node.js**: 14.x or higher
  - [Download Node.js](https://nodejs.org/)
  - Verify: `node --version` and `npm --version`

- **npm**: Usually comes with Node.js
  - Update: `npm install -g npm@latest`

- **Git**: For version control
  - [Download Git](https://git-scm.com/)

### Installation Steps

```bash
# 1. Navigate to backend directory
cd backend

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example .env

# 4. Configure .env with your credentials
# (See Environment Configuration section below)

# 5. Start development server
npm run dev
```

Expected output:
```
[2026-02-08T10:00:00.000Z] [INFO] Server started | {"port":5000,"environment":"development"}
```

---

## Environment Configuration

### Creating .env File

```bash
# Copy example configuration
cp .env.example .env

# Edit .env with your settings
code .env  # or use your editor
```

### Required Configuration

```env
# Server Configuration
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:3000

# GCash Merchant Credentials
GCASH_MERCHANT_ID=your_merchant_id_here
GCASH_API_KEY=your_api_key_here
GCASH_SECRET_KEY=your_secret_key_here
GCASH_WEBHOOK_SECRET=your_webhook_secret_here

# Payment Settings
PAYMENT_TIMEOUT_SECONDS=300
```

### Optional Configuration

```env
# Security
ENABLE_HELMET=true
ENABLE_CORS=true
CORS_CREDENTIALS=true

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info

# API Settings
GCASH_API_BASE_URL=https://api.gcash.com
PAYMENT_POLLING_INTERVAL_MS=3000
```

### Getting GCash Credentials

1. Visit [GCash Developer Portal](https://developer.gcash.com)
2. Create a merchant account
3. Generate API credentials
4. Copy credentials to `.env` file
5. Keep `.env` file secret - **never commit** to version control

### .gitignore Verification

Ensure `.env` is in `.gitignore`:

```bash
# Check if .env is ignored
cat .gitignore | grep ".env"
```

Should show:
```
.env
.env*.local
```

---

## Running the Server

### Development Mode (with auto-reload)

```bash
npm run dev
```

Features:
- Auto-reloads on file changes
- Detailed logging
- Extended error information
- Development endpoints enabled

Access the server:
```
http://localhost:5000
```

Test it:
```bash
curl http://localhost:5000/health
```

### Production Build

```bash
# Compile TypeScript
npm run build

# This creates the `dist/` directory
```

### Production Mode (with compiled code)

```bash
npm start
```

This runs from `dist/` directory (pre-compiled).

---

## Testing

### Manual Testing with cURL

```bash
# 1. Create a payment
curl -X POST http://localhost:5000/api/gcash/create-payment \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 50.00,
    "serviceType": "print",
    "documentCount": 5
  }'

# Expected response (save transactionId):
# {
#   "data": {
#     "transactionId": "TXN-xxx",
#     "referenceNumber": "REF-xxx",
#     "qrCode": "base64...",
#     "expiresIn": 300
#   }
# }

# 2. Check payment status
curl http://localhost:5000/api/gcash/check-payment/TXN-xxx

# 3. Test simulation (dev only)
curl -X POST http://localhost:5000/api/gcash/simulate/success/TXN-xxx

# 4. Check health
curl http://localhost:5000/health
```

### Testing with Postman

1. Download [Postman](https://www.postman.com/downloads/)
2. Import API endpoints
3. Test each endpoint with different payloads
4. Use environment variables for `{{BASE_URL}}`

### Testing with Jest

```bash
# Run tests
npm test

# Watch mode (re-run on changes)
npm test -- --watch

# Coverage report
npm test -- --coverage
```

### Using Development Testing Endpoints

When `NODE_ENV=development`, use these endpoints:

```bash
# Simulate successful payment
curl -X POST http://localhost:5000/api/gcash/simulate/success/TXN-xxx

# Simulate failed payment
curl -X POST http://localhost:5000/api/gcash/simulate/failure/TXN-xxx \
  -H "Content-Type: application/json" \
  -d '{"reason": "Insufficient funds"}'
```

---

## Docker Deployment

### Prerequisites

- [Docker](https://www.docker.com/products/docker-desktop) installed
- [Docker Compose](https://docs.docker.com/compose/install/) installed

### Build Docker Image

```bash
# Build the image
docker build -t web-doc-backend:latest .

# Verify build
docker images | grep web-doc-backend
```

### Run with Docker

```bash
# Run container
docker run -p 5000:5000 \
  -e NODE_ENV=development \
  -e GCASH_MERCHANT_ID=your_id \
  -e GCASH_API_KEY=your_key \
  -e GCASH_SECRET_KEY=your_secret \
  -e GCASH_WEBHOOK_SECRET=your_webhook \
  -e FRONTEND_URL=http://localhost:3000 \
  web-doc-backend:latest

# Run interactive mode
docker run -it -p 5000:5000 web-doc-backend:latest

# Run in background
docker run -d -p 5000:5000 web-doc-backend:latest
```

### Using Docker Compose

```bash
# Start all services
docker-compose up

# Start in background
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop services
docker-compose down

# Rebuild services
docker-compose up --build
```

### Docker Compose Environment

Edit `docker-compose.yml` to configure:

```yaml
environment:
  NODE_ENV: development
  GCASH_MERCHANT_ID: your_id
  GCASH_API_KEY: your_key
  # ... other variables
```

Or create `.env` and reference it:

```bash
# Docker Compose will use .env automatically
docker-compose up
```

---

## Production Deployment

### Heroku Deployment

```bash
# 1. Install Heroku CLI
# From: https://devcenter.heroku.com/articles/heroku-cli

# 2. Login to Heroku
heroku login

# 3. Create Heroku app
heroku create web-doc-backend

# 4. Set environment variables
heroku config:set NODE_ENV=production
heroku config:set GCASH_MERCHANT_ID=your_id
heroku config:set GCASH_API_KEY=your_key
heroku config:set GCASH_SECRET_KEY=your_secret
heroku config:set GCASH_WEBHOOK_SECRET=your_webhook
heroku config:set FRONTEND_URL=https://your-frontend.com

# 5. Deploy code
git push heroku main

# 6. View logs
heroku logs --tail

# 7. Check health
curl https://web-doc-backend.herokuapp.com/health
```

### AWS EC2 Deployment

```bash
# 1. SSH into EC2 instance
ssh -i your-key.pem ec2-user@your-instance-ip

# 2. Install Node.js
curl -sL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# 3. Clone repository
git clone https://github.com/your-repo/web_doc.git
cd web_doc/backend

# 4. Install dependencies
npm install

# 5. Create .env file
nano .env
# (Add your configuration)

# 6. Build
npm run build

# 7. Start with PM2
npm install -g pm2
pm2 start dist/index.js --name "web-doc-backend"
pm2 startup
pm2 save

# 8. Setup Nginx reverse proxy
sudo yum install nginx
sudo systemctl start nginx

# Configure nginx at /etc/nginx/nginx.conf
# (See nginx configuration below)
```

### Nginx Configuration

Create `/etc/nginx/conf.d/web-doc.conf`:

```nginx
upstream web_doc_backend {
  server localhost:5000;
}

server {
  listen 80;
  server_name your-domain.com;

  # Redirect HTTP to HTTPS
  return 301 https://$server_name$request_uri;
}

server {
  listen 443 ssl http2;
  server_name your-domain.com;

  # SSL certificates (from Let's Encrypt)
  ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

  # Proxy to backend
  location / {
    proxy_pass http://web_doc_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Reload nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### DigitalOcean App Platform

```bash
# 1. Create app.yaml in project root
cat > app.yaml << EOF
name: web-doc-backend
services:
  - name: api
    github:
      repo: your-username/web_doc
      branch: main
    build_command: npm install && npm run build
    run_command: npm start
    envs:
      - key: NODE_ENV
        value: production
      - key: GCASH_MERCHANT_ID
        value: ${GCASH_MERCHANT_ID}
      # ... other vars
EOF

# 2. Deploy
doctl apps create --spec app.yaml

# 3. Check deployment
doctl apps list
```

---

## Monitoring & Maintenance

### Log Monitoring

```bash
# Development
npm run dev 2>&1 | tee server.log

# View logs
journalctl -u web-doc-backend -f
```

### Health Check Script

```bash
#!/bin/bash
# health-check.sh

API_URL="https://your-api.com/health"
ALERT_EMAIL="admin@example.com"

response=$(curl -s $API_URL)
status=$(echo $response | jq -r '.data.status')

if [ "$status" != "healthy" ]; then
  echo "API is unhealthy" | mail -s "Alert: API Health Check Failed" $ALERT_EMAIL
fi
```

Setup cron job:
```bash
# Every 5 minutes
*/5 * * * * /path/to/health-check.sh
```

### Performance Monitoring

```bash
# Install PM2 monitoring
pm2 install pm2-auto-pull
pm2 install pm2-logrotate

# Monitor processes
pm2 monit
```

---

## Troubleshooting

### Port Already in Use

```bash
# macOS/Linux: Find process
lsof -i :5000

# Kill process
kill -9 <PID>

# Or use different port
PORT=3001 npm run dev
```

**Windows:**
```powershell
# Find process on port 5000
netstat -ano | findstr :5000

# Kill process
taskkill /PID <PID> /F
```

### Environment Variables Not Loaded

```bash
# Check .env file exists
ls -la .env

# Verify format (no spaces around =)
cat .env

# Reload environment
source .env  # Linux/macOS
set -a; source .env; set +a  # Bash specific
```

### CORS Errors

1. Verify `FRONTEND_URL` matches exactly:
   ```bash
   echo $FRONTEND_URL
   ```

2. Check CORS is enabled in .env:
   ```
   ENABLE_CORS=true
   ```

3. Test with curl:
   ```bash
   curl -H "Origin: http://localhost:3000" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS http://localhost:5000/api/gcash/create-payment
   ```

### Database Connection Issues

For future database integration:

```bash
# Test connection
node -e "
  const db = require('./src/db');
  db.connect().then(() => console.log('Connected')).catch(e => console.error(e));
"
```

### Memory Issues

```bash
# Increase Node memory
node --max-old-space-size=4096 dist/index.js

# Or set environment
export NODE_OPTIONS=--max-old-space-size=4096
npm start
```

### Webhook Signature Verification Failing

1. Verify webhook secret:
   ```bash
   echo $GCASH_WEBHOOK_SECRET
   ```

2. Check payload is not modified during transmission

3. Verify header name is correct: `X-Webhook-Signature`

4. Test signature generation:
   ```bash
   node -e "
     const crypto = require('crypto');
     const secret = 'test-secret';
     const payload = '{}';
     const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
     console.log(sig);
   "
   ```

---

## Next Steps

1. **Frontend Integration**: Use the [example-client.tsx](./example-client.tsx)
2. **Database Integration**: Migrate from in-memory to PostgreSQL/MongoDB
3. **Testing**: Run comprehensive test suite
4. **Documentation**: Review [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
5. **Security**: Enable additional security headers and authentication

---

## Getting Help

- Check [README.md](./README.md) for overview
- Read [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for endpoint details
- Search [GitHub Issues](https://github.com/your-repo/issues)
- Contact [support@example.com](mailto:support@example.com)

---

**Version**: 1.0.0  
**Last Updated**: February 8, 2026
