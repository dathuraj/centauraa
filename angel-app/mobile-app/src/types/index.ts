export interface User {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
}

export interface AuthResponse {
  access_token: string;
}

export interface Message {
  id: string;
  content: string;
  senderType: 'USER' | 'BOT';
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages?: Message[];
}

export interface MoodLog {
  id: string;
  mood: number;
  note?: string;
  createdAt: string;
}

export interface MoodStats {
  average: number;
  trend: 'improving' | 'declining' | 'stable';
  data: MoodLog[];
}
