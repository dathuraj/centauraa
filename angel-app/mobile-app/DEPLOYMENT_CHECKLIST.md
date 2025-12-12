# AngelApp - Deployment Checklist

## Quick Reference for App Store Submission

### Before You Start
- [ ] Active Apple Developer account ($99/year)
- [ ] Access to App Store Connect
- [ ] Xcode installed on Mac
- [ ] Bundle ID: com.centauraa.angelapp

---

## Phase 1: Apple Developer Portal Setup

### Create App ID
- [ ] Log into [developer.apple.com](https://developer.apple.com)
- [ ] Go to Certificates, Identifiers & Profiles
- [ ] Create identifier: com.centauraa.angelapp
- [ ] Enable required capabilities (if any)

### Create Distribution Certificate
- [ ] Open Keychain Access → Request Certificate from CA
- [ ] Upload CSR to Developer Portal
- [ ] Download and install distribution certificate
- [ ] Verify certificate in Keychain Access

### Create Provisioning Profile
- [ ] Create App Store provisioning profile
- [ ] Select app ID: com.centauraa.angelapp
- [ ] Select distribution certificate
- [ ] Download profile: AngelApp App Store.mobileprovision
- [ ] Double-click to install

---

## Phase 2: App Store Connect Setup

### Create App Listing
- [ ] Log into [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
- [ ] Click "+" → New App
- [ ] Platform: iOS
- [ ] Name: AngelApp
- [ ] Bundle ID: com.centauraa.angelapp
- [ ] SKU: ANGELAPP001
- [ ] User Access: Full Access

### Required URLs (MUST BE LIVE)
- [ ] **Privacy Policy URL:** https://centauraa.com/privacy ⚠️ REQUIRED
- [ ] **Support URL:** https://centauraa.com/support
- [ ] **Marketing URL:** https://centauraa.com (optional)

### App Information
- [ ] Primary Category: Productivity
- [ ] Secondary Category: Utilities
- [ ] Age Rating: Complete questionnaire (likely 4+)
- [ ] Copyright: © 2024 Centauraa

---

## Phase 3: Xcode Configuration

### Open Project
```bash
cd /Users/dathu/Documents/centauraa/angel-app/mobile-app/ios
open AngelApp.xcworkspace
```

### Configure Signing
- [ ] Select AngelApp project in navigator
- [ ] Select AngelApp target
- [ ] Go to Signing & Capabilities
- [ ] **UNCHECK** "Automatically manage signing"
- [ ] Team: [Your Team Name]
- [ ] Provisioning Profile: AngelApp App Store
- [ ] Signing Certificate: Apple Distribution

### Verify Settings
- [ ] Bundle ID: com.centauraa.angelapp ✓
- [ ] Version: 1.0.0 ✓
- [ ] Build: 1 ✓
- [ ] Display Name: AngelApp ✓
- [ ] Deployment Target: iOS 13.0+

---

## Phase 4: Prepare Build

### Run Preparation Script
```bash
cd /Users/dathu/Documents/centauraa/angel-app/mobile-app
./prepare-ios-build.sh
```

Or manually:
- [ ] Clean build artifacts: `rm -rf ios/build`
- [ ] Install dependencies: `npm install`
- [ ] Install pods: `cd ios && pod install`
- [ ] Clean DerivedData: `rm -rf ~/Library/Developer/Xcode/DerivedData`

---

## Phase 5: Create Archive

### In Xcode:
1. [ ] Select build destination: **Any iOS Device (arm64)**
2. [ ] Product → Clean Build Folder (⇧⌘K)
3. [ ] Product → Archive
4. [ ] Wait for "Archive succeeded" (may take 5-10 minutes)
5. [ ] Organizer window opens automatically

### If Build Fails:
- Check signing configuration
- Verify provisioning profile matches bundle ID
- Check for missing dependencies
- Review build logs for specific errors

---

## Phase 6: Upload to App Store Connect

### Distribute App
1. [ ] In Organizer, select your archive
2. [ ] Click "Distribute App"
3. [ ] Select: App Store Connect
4. [ ] Select: Upload
5. [ ] Distribution options:
   - Upload symbols: ✓ Yes
   - Manage version: ✓ Yes
6. [ ] Click Next → Upload
7. [ ] Wait for upload (may take 10-30 minutes)

### Verify Upload
- [ ] Check App Store Connect for processing status
- [ ] Wait for "Ready to Submit" status (~15-60 minutes)
- [ ] Build appears under TestFlight tab

---

## Phase 7: Complete App Store Metadata

### Basic Information
- [ ] App Name: AngelApp
- [ ] Subtitle: Your Personal AI Assistant
- [ ] Description: (see APP_STORE_METADATA.md)
- [ ] Keywords: AI,assistant,voice,conversation,chat
- [ ] Support URL: https://centauraa.com/support
- [ ] Marketing URL: https://centauraa.com
- [ ] Privacy URL: https://centauraa.com/privacy

### Screenshots (REQUIRED)
- [ ] iPhone 6.7" (1290x2796): Minimum 3 screenshots
- [ ] Show key features and UI
- [ ] Use actual app screenshots

### App Privacy
- [ ] Complete privacy questionnaire
- [ ] Audio Data: App Functionality, temporary processing
- [ ] Microphone permission: For voice conversations

### App Review Information
- [ ] First Name: [Your Name]
- [ ] Last Name: [Your Name]
- [ ] Phone: [Your Phone]
- [ ] Email: [Your Email]
- [ ] Notes: Instructions for reviewer
- [ ] Demo account (if required): N/A

### Pricing & Availability
- [ ] Price: Free (or set price)
- [ ] Territories: All countries
- [ ] Release: Manual or Automatic

---

## Phase 8: TestFlight Testing (Recommended)

### Before Submission:
- [ ] Add internal testers in TestFlight
- [ ] Wait for build to process
- [ ] Install on test devices
- [ ] Test all core features
- [ ] Verify microphone permission works
- [ ] Test on different iOS versions
- [ ] Check for crashes or bugs

### Test Cases:
- [ ] App launches successfully
- [ ] Microphone permission prompt appears
- [ ] Voice recording works
- [ ] AI responses are received
- [ ] UI is responsive and correct
- [ ] No crashes during normal use

---

## Phase 9: Submit for Review

### Final Checks
- [ ] All metadata fields complete
- [ ] Screenshots uploaded (minimum 3)
- [ ] Build selected for submission
- [ ] Privacy policy accessible
- [ ] Support URL working
- [ ] App tested via TestFlight
- [ ] No pending crashes or issues

### Submit
1. [ ] Go to App Store tab in App Store Connect
2. [ ] Click "+ Version" for 1.0.0
3. [ ] Complete all required fields
4. [ ] Select your build
5. [ ] Review all information
6. [ ] Click "Submit for Review"

### What's Next
- Review typically takes 24-48 hours
- Monitor status in App Store Connect
- You'll receive email updates
- If rejected: Fix issues and resubmit
- If approved: App goes live automatically (or scheduled date)

---

## Phase 10: Post-Launch

### Monitor
- [ ] Check App Store Connect Analytics
- [ ] Review crash reports
- [ ] Read user reviews
- [ ] Monitor ratings

### Respond
- [ ] Reply to user reviews
- [ ] Address reported issues
- [ ] Plan future updates

### Updates
- [ ] Increment version number
- [ ] Update release notes
- [ ] Submit new build
- [ ] Repeat process

---

## Quick Commands Reference

```bash
# Prepare build environment
cd /Users/dathu/Documents/centauraa/angel-app/mobile-app
./prepare-ios-build.sh

# Open Xcode workspace
open ios/AngelApp.xcworkspace

# Clean build
rm -rf ios/build
rm -rf ~/Library/Developer/Xcode/DerivedData

# Reinstall pods
cd ios && pod install && cd ..

# View app.json config
cat app.json

# View Info.plist
cat ios/AngelApp/Info.plist
```

---

## Need Help?

- **Deployment Guide:** See `APP_STORE_DEPLOYMENT.md`
- **Metadata Template:** See `APP_STORE_METADATA.md`
- **Apple Docs:** [App Store Connect Help](https://help.apple.com/app-store-connect/)
- **Review Guidelines:** [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

---

## Important Reminders

⚠️ **MUST HAVE before submission:**
1. Live privacy policy URL
2. Working support URL
3. At least 3 screenshots
4. Valid distribution certificate and profile
5. Build uploaded and processed
6. All metadata complete

⚠️ **Common rejection reasons:**
- Missing/broken privacy policy
- Crashes during review
- Incomplete app information
- Misleading screenshots
- Inadequate permission descriptions

---

**Estimated Total Time:** 4-6 hours (first time)
**Review Time:** 24-48 hours typically
**Expedited Review:** Available for urgent issues only

Good luck with your submission! 🚀
