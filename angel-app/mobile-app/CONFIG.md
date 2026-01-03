# Mobile App Configuration Guide

## Overview

The mobile app uses a centralized configuration system to manage environment-specific settings like API URLs, timeouts, and debug modes.

## Configuration Files

### `.env` - Local Development Settings
Your personal development settings. **Not committed to git**.

### `.env.example` - Template
Template showing all available configuration options. Safe to commit.

### `.env.development` - Development Environment
Default settings for development. Can be committed.

### `.env.production` - Production Environment
Production settings. Can be committed (unless containing secrets).

## Environment Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `API_URL` | Backend API base URL | `http://localhost:3000` | `http://10.0.2.2:3000` |
| `APP_ENV` | Environment name | `development` | `production` |
| `API_TIMEOUT` | Request timeout (ms) | `30000` | `60000` |
| `DEBUG_MODE` | Enable debug logging | `true` | `false` |

## Platform-Specific URLs

### iOS Simulator
```env
API_URL=http://localhost:3000
```
The simulator can access `localhost` directly.

### Android Emulator
```env
API_URL=http://10.0.2.2:3000
```
Android emulator uses `10.0.2.2` as an alias to host machine's `localhost`.

### Physical Device (iOS/Android)
```env
API_URL=http://192.168.1.100:3000
```
Use your computer's local network IP address. Find it with:
- macOS: `ifconfig | grep inet`
- Windows: `ipconfig`
- Linux: `ip addr show`

### Production
```env
API_URL=http://angel-backend-dev-alb-448499488.us-west-2.elb.amazonaws.com
```

## Setup Instructions

### 1. Create Local Configuration

Copy the example file:
```bash
cp .env.example .env
```

### 2. Customize for Your Setup

Edit `.env` based on your platform:

**For iOS Simulator:**
```env
API_URL=http://localhost:3000
```

**For Android Emulator:**
```env
API_URL=http://10.0.2.2:3000
```

**For Physical Device:**
```env
# Replace with your computer's IP
API_URL=http://192.168.1.100:3000
```

### 3. Restart Metro Bundler

Environment changes require a restart:
```bash
npm start -- --clear
```

## Usage in Code

### Import the Config

```typescript
import config from '../config/environment';

// Access configuration
console.log(config.apiUrl);      // http://localhost:3000
console.log(config.environment);  // development
console.log(config.debugMode);    // true
```

### Use Helper Functions

```typescript
import { isDevelopment, isProduction } from '../config/environment';

if (isDevelopment()) {
  console.log('Running in development mode');
}

if (isProduction()) {
  // Enable production optimizations
}
```

### Update API Service

The API service automatically uses the configured URL:

```typescript
import { api } from '../services/api';

// This will use the URL from config
const response = await api.get('/users/me');
```

## Troubleshooting

### "Network request failed" on Android
- Make sure you're using `10.0.2.2:3000` instead of `localhost:3000`
- Check that backend is running on port 3000
- Verify Android emulator can access network

### "Network request failed" on iOS
- Ensure backend is running
- Check Info.plist allows local networking (already configured)
- Try restarting Metro bundler

### "Connection refused" on Physical Device
- Verify both device and computer are on same WiFi network
- Use your computer's actual IP (not localhost)
- Check firewall isn't blocking port 3000
- Ensure backend is listening on `0.0.0.0` not just `127.0.0.1`

### Changes not taking effect
- Clear Metro cache: `npm start -- --clear`
- Reload app: shake device → "Reload"
- Restart Metro bundler completely

## Environment Selection

The app automatically detects the environment:
1. Checks `process.env.APP_ENV` from `.env`
2. Falls back to `__DEV__` flag (true in dev, false in production builds)
3. Adjusts behavior (logging, error handling, etc.)

## Best Practices

1. **Never commit `.env`** - Contains personal/local settings
2. **Always commit `.env.example`** - Shows required variables
3. **Update `.env.example`** when adding new variables
4. **Use `.env.development`** for team defaults
5. **Restart Metro** after changing environment files
6. **Verify API URL** when switching between devices/emulators

## Security Notes

- `.env` is in `.gitignore` to prevent accidental commits
- Production URLs without secrets can be in `.env.production`
- Never put API keys or secrets in any `.env` file
- Use Expo SecureStore for sensitive data at runtime

## Adding New Variables

1. Add to `.env.example` with documentation
2. Add to `environment.ts` interface and config object
3. Update this README with variable documentation
4. Update `.env.development` and `.env.production` as needed

Example:

```typescript
// In environment.ts
interface Environment {
  apiUrl: string;
  newVariable: string; // Add new variable
}

export const config: Environment = {
  apiUrl: getApiUrl(),
  newVariable: process.env.NEW_VARIABLE || 'default-value',
};
```

```env
# In .env.example
# Description of new variable
NEW_VARIABLE=default-value
```
