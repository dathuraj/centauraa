import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// API URL Configuration
// Local development: http://localhost:3000
// iOS Simulator: http://localhost:3000
// Android Emulator: http://10.0.2.2:3000
// Physical Device: http://YOUR_COMPUTER_IP:3000 (e.g., http://192.168.1.100:3000)
// AWS Production: http://angel-backend-dev-alb-448499488.us-west-2.elb.amazonaws.com
const API_URL = 'http://localhost:3000';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout (increased for RAG queries)
});

// Request interceptor to add auth token
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (email: string) =>
    api.post('/auth/register', { email }),

  verify: (email: string, otp: string) =>
    api.post('/auth/verify', { email, otp }),

  login: (email: string) =>
    api.post('/auth/login', { email }),
};

// User API
export const userAPI = {
  getProfile: () => api.get('/users/me'),
  updateProfile: (name: string) => api.put('/users/me', { name }),
};

// Chat API
export const chatAPI = {
  sendMessage: (message: string, conversationId?: string) =>
    api.post('/chat/send', { message, conversationId }),

  getHistory: (limit?: number) =>
    api.get('/chat/history', { params: { limit } }),

  getConversations: (limit?: number) =>
    api.get('/chat/conversations', { params: { limit } }),

  getConversation: (conversationId: string) =>
    api.get(`/chat/conversations/${conversationId}`),
};

// Voice API
export const voiceAPI = {
  sendVoiceMessage: async (audioUri: string) => {
    const formData = new FormData();

    // Get file extension from URI
    const uriParts = audioUri.split('.');
    const fileType = uriParts[uriParts.length - 1];

    formData.append('audio', {
      uri: audioUri,
      type: `audio/${fileType}`,
      name: `recording.${fileType}`,
    } as any);

    const token = await AsyncStorage.getItem('auth_token');

    return axios.post(`${API_URL}/voice/message`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        Authorization: `Bearer ${token}`,
      },
      timeout: 30000, // 30 second timeout for voice processing
    });
  },

  transcribeAudio: async (audioUri: string) => {
    const formData = new FormData();

    const uriParts = audioUri.split('.');
    const fileType = uriParts[uriParts.length - 1];

    formData.append('audio', {
      uri: audioUri,
      type: `audio/${fileType}`,
      name: `recording.${fileType}`,
    } as any);

    const token = await AsyncStorage.getItem('auth_token');

    return axios.post(`${API_URL}/voice/transcribe`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        Authorization: `Bearer ${token}`,
      },
      timeout: 30000, // 30 second timeout for transcription
    });
  },
};

// Mood API
export const moodAPI = {
  logMood: (mood: number, note?: string) =>
    api.post('/mood/log', { mood, note }),

  getHistory: (days?: number) =>
    api.get('/mood/history', { params: { days } }),

  getStats: (days?: number) =>
    api.get('/mood/stats', { params: { days } }),
};
