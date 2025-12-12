# TestFlight Build Instructions - OTP Fix

## Changes Applied
- Added App Transport Security (ATS) exception to allow HTTP connections to the backend
- This allows the iOS app to communicate with the backend over HTTP

## Build and Upload to TestFlight

### Option 1: Using EAS Build (Recommended)

1. Navigate to the mobile-app directory:
   ```bash
   cd /Users/dathu/Documents/centauraa/angel-app/mobile-app
   ```

2. Install EAS CLI (if not already installed):
   ```bash
   npm install -g eas-cli
   ```

3. Login to Expo:
   ```bash
   eas login
   ```

4. Build for iOS:
   ```bash
   eas build --platform ios
   ```

5. Submit to TestFlight:
   ```bash
   eas submit --platform ios
   ```

### Option 2: Using Xcode

1. Navigate to the mobile-app directory:
   ```bash
   cd /Users/dathu/Documents/centauraa/angel-app/mobile-app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Install iOS pods:
   ```bash
   cd ios
   pod install
   cd ..
   ```

4. Open Xcode:
   ```bash
   open ios/AngelApp.xcworkspace
   ```

5. In Xcode:
   - Select your signing team
   - Increment the build number (Product > Archive)
   - Archive the app
   - Upload to App Store Connect
   - Submit to TestFlight

## Testing After Upload

1. Wait for TestFlight processing (usually 5-10 minutes)
2. Install the new build from TestFlight
3. Try the registration/login flow
4. You should now receive OTP emails successfully

## What Was Fixed

The issue was that iOS App Transport Security (ATS) blocks HTTP connections by default in production builds (including TestFlight). The backend ALB doesn't have HTTPS configured, so we added a specific exception for the backend domain.

**Domain allowed:** `angel-backend-dev-alb-448499488.us-west-2.elb.amazonaws.com`

## Note for Future

For production release to the App Store, you should:
1. Get a custom domain name
2. Configure HTTPS on the AWS ALB with an SSL certificate
3. Update the app to use HTTPS
4. Remove the ATS exception

Apple may ask for justification during App Store review about why HTTP is being used.
