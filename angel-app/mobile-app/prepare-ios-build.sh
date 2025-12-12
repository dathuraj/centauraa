#!/bin/bash
# prepare-ios-build.sh
# Prepares the iOS app for App Store submission

set -e  # Exit on error

echo "=========================================="
echo "AngelApp - iOS Build Preparation"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Change to mobile app directory
cd "$(dirname "$0")"

echo "Step 1: Cleaning previous builds..."
echo "---"
rm -rf ios/build
rm -rf ~/Library/Developer/Xcode/DerivedData/AngelApp-*
echo -e "${GREEN}✓ Build artifacts cleaned${NC}"
echo ""

echo "Step 2: Installing dependencies..."
echo "---"
if [ ! -d "node_modules" ]; then
    echo "Installing npm packages..."
    npm install
else
    echo "Node modules already installed"
fi
echo -e "${GREEN}✓ Dependencies ready${NC}"
echo ""

echo "Step 3: Installing iOS pods..."
echo "---"
cd ios
if command -v pod &> /dev/null; then
    pod install
    echo -e "${GREEN}✓ Pods installed${NC}"
else
    echo -e "${RED}✗ CocoaPods not found. Install with: sudo gem install cocoapods${NC}"
    exit 1
fi
cd ..
echo ""

echo "Step 4: Verifying configuration..."
echo "---"

# Check bundle identifier
BUNDLE_ID=$(grep -A 1 "bundleIdentifier" app.json | tail -1 | cut -d'"' -f4)
echo "Bundle ID: $BUNDLE_ID"

if [ "$BUNDLE_ID" == "com.centauraa.angelapp" ]; then
    echo -e "${GREEN}✓ Bundle ID configured correctly${NC}"
else
    echo -e "${YELLOW}⚠ Bundle ID might not be set correctly${NC}"
fi

# Check version
VERSION=$(grep -A 1 '"version"' app.json | head -2 | tail -1 | cut -d'"' -f4)
echo "App Version: $VERSION"
echo -e "${GREEN}✓ Version: $VERSION${NC}"
echo ""

echo "Step 5: Pre-flight checklist..."
echo "---"
echo "Please verify the following before building:"
echo ""
echo "[ ] 1. Apple Developer account is active"
echo "[ ] 2. App ID registered in Developer Portal (com.centauraa.angelapp)"
echo "[ ] 3. Distribution certificate installed in Keychain"
echo "[ ] 4. App Store provisioning profile downloaded"
echo "[ ] 5. Privacy policy URL is live"
echo "[ ] 6. Support URL is accessible"
echo "[ ] 7. App Store Connect app listing created"
echo ""

read -p "Have you completed all the above steps? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Please complete the checklist items first.${NC}"
    echo "See APP_STORE_DEPLOYMENT.md for detailed instructions."
    exit 1
fi
echo ""

echo "=========================================="
echo "Build Preparation Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Open Xcode: open ios/AngelApp.xcworkspace"
echo "2. Select 'Any iOS Device (arm64)' as build destination"
echo "3. Go to Product → Clean Build Folder (⇧⌘K)"
echo "4. Go to Product → Archive"
echo "5. Wait for archive to complete"
echo "6. In Organizer, click 'Distribute App'"
echo "7. Select 'App Store Connect' and follow prompts"
echo ""
echo "For detailed instructions, see: APP_STORE_DEPLOYMENT.md"
echo ""
