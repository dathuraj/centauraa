import { Platform } from 'react-native';
import { API_URL, APP_ENV, API_TIMEOUT, DEBUG_MODE } from '@env';

/**
 * Environment Configuration
 *
 * This file provides centralized configuration for the mobile app.
 * Values can be overridden by creating a .env file in the project root.
 */

interface Environment {
  apiUrl: string;
  environment: 'development' | 'staging' | 'production';
  apiTimeout: number;
  debugMode: boolean;
}

/**
 * Get API URL based on platform and environment
 */
const getApiUrl = (): string => {
  // Try to read from .env file (loaded via react-native-dotenv)
  if (API_URL) {
    return API_URL;
  }

  // Default URLs based on platform
  // iOS Simulator: localhost works
  // Android Emulator: Use 10.0.2.2 (special alias to host machine)
  // Physical Device: Use your computer's local IP address

  if (Platform.OS === 'android') {
    // Android emulator
    return 'http://10.0.2.2:3000';
  }

  // iOS simulator or default
  return 'http://localhost:3000';
};

/**
 * Environment configuration object
 */
export const config: Environment = {
  apiUrl: getApiUrl(),
  environment: (APP_ENV as Environment['environment']) || 'development',
  apiTimeout: parseInt(API_TIMEOUT || '30000', 10),
  debugMode: DEBUG_MODE === 'true' || __DEV__,
};

/**
 * Check if running in development mode
 */
export const isDevelopment = (): boolean => {
  return config.environment === 'development' || __DEV__;
};

/**
 * Check if running in production mode
 */
export const isProduction = (): boolean => {
  return config.environment === 'production';
};

/**
 * Log configuration on app start (only in development)
 */
if (config.debugMode) {
  console.log('📱 App Configuration:');
  console.log(`  Environment: ${config.environment}`);
  console.log(`  API URL: ${config.apiUrl}`);
  console.log(`  Platform: ${Platform.OS}`);
  console.log(`  Debug Mode: ${config.debugMode}`);
}

export default config;
