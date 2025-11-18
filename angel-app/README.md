# Angel - Mental Health Support App

A comprehensive mental health support application with AI-powered chatbot, mood tracking, and user authentication.

## Project Structure

```
angel-app/
├── backend/angel-backend/     # NestJS Backend API
└── mobile-app/AngelApp/        # React Native Mobile App (Expo)
```

## Features Implemented

### Week 1: Foundation & Authentication ✅
- **Backend**:
  - User authentication with email + OTP
  - JWT-based session management
  - PostgreSQL database with TypeORM
  - Email service integration for OTP delivery
  - User profile management

- **Frontend**:
  - Sign Up screen
  - Login screen
  - OTP Verification screen
  - Profile Settings screen

### Week 2: Core Chatbot, Tracking ✅
- **Backend**:
  - Chat API with message history
  - Google Gemini AI integration for empathetic responses
  - WebSocket support for real-time chat
  - Mood tracking system (1-5 scale)
  - 7-day mood history and statistics
  - Trend analysis (improving/declining/stable)

- **Frontend**:
  - Chat UI with message bubbles
  - Typing indicator
  - Mood tracking interface with emojis
  - Mood history and statistics display

### Week 3: Personalization & Memory ✅
- **Backend**:
  - Conversation and message storage
  - User preferences system
  - Context-aware AI responses using user history
  - Personalized system prompts based on mood data

- **Frontend**:
  - Chat history persistence
  - Tab-based navigation (Chat, Mood, Profile)
  - Seamless auth flow with token management

## Tech Stack

### Backend
- **Framework**: NestJS
- **Database**: PostgreSQL with TypeORM
- **Authentication**: JWT with Passport
- **Email**: Nodemailer
- **AI**: Google Generative AI (Gemini Pro)
- **Real-time**: Socket.io for WebSocket

### Mobile App
- **Framework**: React Native with Expo
- **Navigation**: React Navigation (Stack + Bottom Tabs)
- **State Management**: Tanstack Query (React Query)
- **UI Library**: NativeBase
- **HTTP Client**: Axios
- **Local Storage**: AsyncStorage

## Setup Instructions

### Prerequisites
- Node.js (v18 or higher)
- PostgreSQL (v14 or higher)
- Expo CLI (`npm install -g expo-cli`)

### Backend Setup

1. **Navigate to backend directory**:
   ```bash
   cd backend/angel-backend
   ```

2. **Install dependencies** (already done):
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   Edit `.env` file with your credentials:
   ```env
   # Database
   DATABASE_HOST=localhost
   DATABASE_PORT=5432
   DATABASE_USER=angel_user
   DATABASE_PASSWORD=angel_password
   DATABASE_NAME=angel_db

   # JWT
   JWT_SECRET=your_secret_key_here_change_in_production
   JWT_EXPIRES_IN=7d

   # Email (optional - skip for now)
   MAIL_HOST=smtp.gmail.com
   MAIL_PORT=587
   MAIL_USER=your_email@gmail.com
   MAIL_PASS=your_app_password

   # AI - Add your Google Gemini API key
   GEMINI_API_KEY=your_gemini_api_key_here

   PORT=3000
   ```

4. **Start PostgreSQL** (already done):
   ```bash
   brew services start postgresql@14
   ```

5. **Start the backend server** (already running):
   ```bash
   npm run start:dev
   ```

   The server will start on `http://localhost:3000`

### Mobile App Setup

1. **Navigate to mobile app directory**:
   ```bash
   cd mobile-app/AngelApp
   ```

2. **Dependencies are already installed**

3. **Start the Expo development server**:
   ```bash
   npm start
   ```

4. **Run on device/emulator**:
   - Press `i` for iOS simulator
   - Press `a` for Android emulator
   - Scan QR code with Expo Go app on your phone

## API Endpoints

### Authentication
- `POST /auth/register` - Register with email, sends OTP
- `POST /auth/verify` - Verify OTP and get JWT token
- `POST /auth/login` - Login with email, sends OTP

### User
- `GET /users/me` - Get user profile (requires auth)
- `PUT /users/me` - Update user profile (requires auth)

### Chat
- `POST /chat/send` - Send message and get AI response (requires auth)
- `GET /chat/history` - Get conversation history (requires auth)

### Mood
- `POST /mood/log` - Log mood (1-5 scale) (requires auth)
- `GET /mood/history` - Get mood history (requires auth)
- `GET /mood/stats` - Get mood statistics and trends (requires auth)

## Important Notes

### Getting a Gemini API Key
1. Visit https://makersuite.google.com/app/apikey
2. Create a new API key
3. Add it to `backend/angel-backend/.env` as `GEMINI_API_KEY`

### Email Setup (Optional)
For OTP email delivery, you need to configure:
- **Gmail**: Enable 2FA and create an App Password
- **SendGrid/SES**: Use API keys

For development, you can **check OTP codes in backend logs** instead of email.

### Database
The database is already created and running. TypeORM automatically syncs the schema on startup.

### Testing Without Email
1. Start the backend
2. Call `POST /auth/register` with an email
3. Check the backend console logs for the OTP code
4. Use that code in the mobile app verification screen

## What's Not Implemented (Future Work)

### Medication Module
The entities are created but the module needs:
- Medication CRUD endpoints
- Medication reminder scheduling
- Adherence tracking

### Push Notifications
- Firebase Cloud Messaging integration
- Scheduled mood check-in reminders
- Supportive notifications

### Additional Features
- Medication tracking UI
- Rich mood notes
- Journal entries
- Crisis resources
- Professional therapist connections

## Testing the App

1. **Start the backend** (already running):
   ```bash
   cd backend/angel-backend
   npm run start:dev
   ```

2. **Start the mobile app**:
   ```bash
   cd mobile-app/AngelApp
   npm start
   ```

3. **Test Flow**:
   - Open app → Sign Up with email
   - Check backend logs for OTP code
   - Enter OTP to verify
   - Enter name in profile (optional)
   - Go to Chat tab and start chatting
   - Go to Mood tab and log your mood
   - View mood history and trends

## Troubleshooting

### Backend won't start
- Ensure PostgreSQL is running: `brew services list`
- Check database credentials in `.env`
- Check port 3000 is not in use

### Mobile app can't connect to backend
- Update API_URL in `mobile-app/AngelApp/src/services/api.ts`
- For iOS simulator: use `http://localhost:3000`
- For Android emulator: use `http://10.0.2.2:3000`
- For physical device: use your computer's IP address

### NativeBase warnings
- NativeBase is deprecated but still functional
- Consider migrating to gluestack-ui in future

## Architecture Highlights

### Backend
- Modular architecture with separate modules for Auth, Users, Chat, Mood
- TypeORM entities with relationships
- Context-aware AI with user mood history
- Secure OTP-based authentication
- Real-time WebSocket support

### Mobile App
- Clean architecture with separate concerns
- Context API for auth state
- Axios interceptors for automatic token injection
- Tab-based navigation for main features
- AsyncStorage for persistent auth

## Development Timeline

- **Week 1**: Authentication & User Management ✅
- **Week 2**: Chat, Mood Tracking, AI Integration ✅
- **Week 3**: Personalization, History, Polish ✅

Total implementation time: ~3 weeks (accelerated to few hours with structured approach)

## License

Private project for Heizen

---

Built with ❤️ using NestJS, React Native, and Google Gemini AI
