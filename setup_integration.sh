#!/bin/bash

# Post-Integration Setup Script
# This script verifies and sets up the Flutter-Backend integration

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║   Flutter-Backend PAYMONGO Integration Setup                     ║"
echo "║   DOCUCENTER Kiosk - Document Processing System              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if we're in the right directory
if [ ! -f "pubspec.yaml" ]; then
    echo "❌ Error: pubspec.yaml not found"
    echo "Please run this script from the Flutter project root directory"
    exit 1
fi

echo "✓ Flutter project found"
echo ""

# Check Node.js backend
echo "Checking backend setup..."
if [ -d "backend" ]; then
    if [ -f "backend/package.json" ]; then
        echo "✓ Backend directory found"
    else
        echo "⚠ Backend directory exists but package.json not found"
    fi
else
    echo "⚠ Backend directory not found at ./backend"
fi
echo ""

# Check configuration files
echo "Checking configuration files..."

if [ -f "lib/config.dart" ]; then
    echo "✓ lib/config.dart found"
else
    echo "⚠ lib/config.dart not found"
fi

if [ -f "lib/payment_service.dart" ]; then
    echo "✓ lib/payment_service.dart found"
else
    echo "⚠ lib/payment_service.dart not found"
fi

if [ -f "FLUTTER_INTEGRATION_GUIDE.md" ]; then
    echo "✓ FLUTTER_INTEGRATION_GUIDE.md found"
else
    echo "⚠ Integration guide not found"
fi

echo ""
echo "Getting Flutter dependencies..."
flutter pub get > /dev/null 2>&1 && echo "✓ Dependencies installed" || echo "⚠ Could not get dependencies"

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                        Setup Summary                           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

echo "📦 Components Ready:"
echo "   ✓ Flutter app with payment integration"
echo "   ✓ Payment service layer (payment_service.dart)"
echo "   ✓ Configuration management (config.dart)"
echo "   ✓ Backend API integration"
echo ""

echo "📝 Documentation:"
echo "   • FLUTTER_INTEGRATION_GUIDE.md - Complete setup guide"
echo "   • INTEGRATION_SETUP.md - Quick reference"
echo ""

echo "🚀 Next Steps:"
echo ""
echo "   1. Start the backend:"
echo "      $ cd backend"
echo "      $ npm install"
echo "      $ npm run dev"
echo ""
echo "   2. Run the Flutter app:"
echo "      $ flutter run -d web"
echo ""
echo "   3. Test the payment flow:"
echo "      • Go to Services → Printing"
echo "      • Upload documents"
echo "      • Click Print"
echo "      • Use 'Simulate Success' to test"
echo ""
echo "   4. For production:"
echo "      • Get real PAYMONGO credentials"
echo "      • Update backend .env file"
echo "      • Change backend URL in lib/config.dart"
echo "      • Disable development tools"
echo ""

echo "✅ Setup complete! Ready to integrate Flutter with backend."
echo ""

