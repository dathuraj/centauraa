# AngelApp - App Store Deployment Guide

## App Configuration

**App Name:** AngelApp
**Bundle Identifier:** com.centauraa.angelapp
**Version:** 1.0.0
**Build Number:** 1

## Pre-Deployment Checklist

### 1. Apple Developer Account Setup
- [ ] Ensure you have an active Apple Developer account ($99/year)
- [ ] Log into [Apple Developer Portal](https://developer.apple.com)
- [ ] Note your Team ID (found in Membership section)

### 2. App Store Connect Setup
- [ ] Log into [App Store Connect](https://appstoreconnect.apple.com)
- [ ] Create a new app listing:
  - Click the "+" button and select "New App"
  - Platform: iOS
  - Name: AngelApp
  - Bundle ID: com.centauraa.angelapp
  - SKU: ANGELAPP001 (or your preferred SKU)
  - User Access: Full Access

### 3. Certificates, Identifiers & Profiles

#### Create App ID
1. Go to [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources)
2. Click Identifiers → "+" button
3. Select "App IDs" → Continue
4. Select "App" → Continue
5. Description: AngelApp
6. Bundle ID: Explicit - `com.centauraa.angelapp`
7. Capabilities to enable:
   - [ ] Associated Domains (if needed)
   - [ ] Push Notifications (if needed)
8. Click Continue → Register

#### Create Distribution Certificate
1. On your Mac, open Keychain Access
2. Menu: Keychain Access → Certificate Assistant → Request a Certificate from a Certificate Authority
3. Enter your email and name
4. Select "Saved to disk" → Continue
5. Save the CertificateSigningRequest.certSigningRequest file

6. In Developer Portal:
   - Go to Certificates → "+" button
   - Select "Apple Distribution" → Continue
   - Upload the CSR file → Continue
   - Download the certificate
   - Double-click to install in Keychain Access

#### Create Provisioning Profile
1. In Developer Portal, go to Profiles → "+" button
2. Select "App Store" → Continue
3. Select App ID: com.centauraa.angelapp → Continue
4. Select your Distribution Certificate → Continue
5. Profile Name: AngelApp App Store
6. Download and double-click to install

### 4. Xcode Configuration

#### Open Project in Xcode
```bash
cd /Users/dathu/Documents/centauraa/angel-app/mobile-app/ios
open AngelApp.xcworkspace
```

#### Configure Signing
1. Select the AngelApp project in the navigator
2. Select the AngelApp target
3. Go to "Signing & Capabilities" tab
4. **Uncheck** "Automatically manage signing"
5. Team: Select your team (requires Team ID)
6. Provisioning Profile: Select "AngelApp App Store" profile
7. Signing Certificate: Select your "Apple Distribution" certificate

#### Build Settings to Verify
1. General tab:
   - Display Name: AngelApp
   - Bundle Identifier: com.centauraa.angelapp
   - Version: 1.0.0
   - Build: 1

2. Deployment Info:
   - Minimum Deployments: iOS 13.0 or later
   - Device Orientation: Portrait

### 5. App Icons & Assets

Current assets location: `/mobile-app/assets/`
- [ ] icon.png (1024x1024 for App Store)
- [ ] App icon set in Xcode (required sizes: 20pt, 29pt, 40pt, 60pt, 76pt, 83.5pt @2x and @3x)
- [ ] Launch screen (splash-icon.png)

**To add app icons:**
1. In Xcode, go to Assets.xcassets → AppIcon
2. Drag and drop appropriate sized icons
3. Or use a tool like [App Icon Generator](https://appicon.co)

### 6. App Store Metadata

Required information for App Store Connect:

#### Basic Information
- **Name:** AngelApp
- **Subtitle:** Your Personal AI Assistant
- **Description:**
```
AngelApp is your personal AI assistant that enables natural voice conversations.
Experience seamless interaction with advanced AI through intuitive voice commands
and real-time responses.

Features:
• Natural voice conversations
• Real-time AI responses
• Simple and intuitive interface
• Secure and private communication
```

- **Keywords:** AI, assistant, voice, conversation, chat, artificial intelligence
- **Support URL:** https://centauraa.com/support (update with your actual URL)
- **Marketing URL:** https://centauraa.com
- **Privacy Policy URL:** https://centauraa.com/privacy (REQUIRED - create this)

#### Categories
- Primary: Productivity
- Secondary: Utilities

#### Pricing
- Free or Paid (update as needed)

#### App Review Information
- Sign-in required: [Yes/No]
- If yes, provide demo account credentials
- Contact: Your email and phone
- Notes: Any special instructions for reviewers

#### Screenshots Required
- 6.7" Display (iPhone 14 Pro Max): 1290 x 2796 pixels
- 5.5" Display (iPhone 8 Plus): 1242 x 2208 pixels
Minimum: 3 screenshots, Maximum: 10 screenshots

### 7. Privacy Manifest

The app requests the following permissions:
- **Microphone Access:** For voice conversations with AI
- **Camera Access:** To capture photos and videos
- **Photo Library Access:** To save and share content

These are already configured in Info.plist with user-friendly descriptions.

### 8. Build & Archive

#### Clean Build
```bash
cd /Users/dathu/Documents/centauraa/angel-app/mobile-app/ios
# Clean previous builds
rm -rf ~/Library/Developer/Xcode/DerivedData
# Install pods
pod install
```

#### Create Archive
1. In Xcode:
   - Select "Any iOS Device (arm64)" as the build destination
   - Menu: Product → Clean Build Folder (⇧⌘K)
   - Menu: Product → Archive (⌘B then Archive)
   - Wait for archive to complete

2. Organizer window will open automatically
   - Select your archive
   - Click "Distribute App"
   - Select "App Store Connect" → Next
   - Select "Upload" → Next
   - Distribution options:
     - ✓ Include bitcode: No (deprecated)
     - ✓ Upload app symbols: Yes
     - ✓ Manage version and build number: Yes
   - Click Next → Upload

### 9. TestFlight (Optional but Recommended)

Before submitting for review:
1. In App Store Connect, go to your app
2. Go to TestFlight tab
3. Add internal testers (up to 100)
4. Wait for build to process (~15-30 minutes)
5. Test the app thoroughly on real devices

### 10. Submit for Review

1. In App Store Connect:
   - Go to your app → App Store tab
   - Click "+" to create new version (1.0.0)
   - Fill in all required metadata
   - Upload screenshots
   - Select build from TestFlight
   - Set pricing and availability
   - Answer Content Rights questions
   - Save and click "Submit for Review"

2. Review times vary (typically 24-48 hours)
3. Monitor status in App Store Connect

## Common Issues & Solutions

### Code Signing Errors
- Ensure provisioning profile matches bundle ID exactly
- Check certificate is valid and not expired
- Restart Xcode after installing certificates

### Build Failures
- Clean build folder: ⇧⌘K
- Delete DerivedData: `rm -rf ~/Library/Developer/Xcode/DerivedData`
- Reinstall pods: `cd ios && pod install`

### Archive Not Appearing
- Ensure build destination is "Any iOS Device"
- Check signing configuration is for Distribution, not Development
- Verify bundle identifier matches App ID

### Validation Errors
- Check all required icons are present
- Verify Info.plist has all required permissions
- Ensure minimum iOS version is compatible

## Post-Submission

After approval:
- [ ] Monitor crash reports in App Store Connect
- [ ] Respond to user reviews
- [ ] Prepare updates with version increments
- [ ] Track analytics and downloads

## Version Updates

For future updates:
1. Increment version or build number in app.json
2. Update CHANGELOG
3. Rebuild and archive
4. Upload new build
5. Submit update for review

## Support Resources

- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [App Store Connect Help](https://help.apple.com/app-store-connect/)
- [Expo iOS Build Guide](https://docs.expo.dev/build/setup/)
- [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)

## Contact

For technical issues, contact: [your-email@example.com]
