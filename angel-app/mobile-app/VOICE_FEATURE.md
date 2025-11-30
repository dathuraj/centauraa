# Voice Chat Feature Guide

The Angel mobile app now supports voice conversations with the AI companion!

## Features

✅ **Microphone/Text Toggle**: Switch between typing and voice input
✅ **Voice Recording**: Hold to record, release to send
✅ **Automatic Transcription**: Your voice is transcribed using Gemini AI
✅ **Voice Responses**: Hear AI responses in natural-sounding voice
✅ **Auto-playback**: Audio responses play automatically
✅ **Full Memory**: Voice conversations maintain context like text chats

## How to Use

### Text Mode (Default)
1. Type your message in the text input
2. Press the send button (✉️)

### Voice Mode
1. **Tap the microphone icon** (🎤) to switch to voice mode
2. **Press and hold** the large microphone button to start recording
3. **Speak your message** while holding the button
4. **Release** the button to stop recording and send
5. The app will:
   - Transcribe your speech
   - Show the transcription as your message
   - Get AI response
   - Display the response text
   - Play the response as audio automatically

### Switching Back
- Tap the text icon (📝) to return to text input mode

## Visual Indicators

- **Blue microphone button**: Ready to record
- **Red pulsing button**: Currently recording
- **"Recording... Release to send"**: Recording in progress
- **"Angel is typing..."**: Processing your message

## Permissions Required

On first use, you'll be asked to grant:
- 🎤 **Microphone permission**: Required for voice recording

## Requirements

### Backend Setup
Your backend must be running with voice support enabled. See `/backend/angel-backend/VOICE_SETUP.md` for setup instructions.

**Minimum setup (FREE)**:
- `GEMINI_API_KEY` in backend `.env` file
- This enables transcription (speech-to-text)

**Full setup (with audio responses)**:
- `GEMINI_API_KEY` (for transcription)
- `GOOGLE_CLOUD_CREDENTIALS` or `GOOGLE_APPLICATION_CREDENTIALS` (for text-to-speech)

### Mobile App
- iOS: Requires iOS 12.0+
- Android: Requires Android 5.0+ (API level 21)
- Microphone permission must be granted

## Technical Details

### Audio Format
- **Recording**: High-quality AAC (iOS) / AMR (Android)
- **Playback**: MP3 audio from server
- **Sample Rate**: 44.1kHz

### API Endpoints Used
- `POST /voice/message`: Send audio, get transcription + AI response + audio
- Backend uses Gemini multimodal API for transcription

### Network
Make sure your `API_URL` in `src/services/api.ts` points to your backend:
```typescript
const API_URL = 'http://YOUR_BACKEND_IP:3000';
```

For iOS Simulator, use your computer's local IP address (not localhost).

## Troubleshooting

### "Permission Required" Alert
- Go to Settings > Privacy > Microphone
- Enable microphone access for Expo Go (or your app)

### "Failed to send voice message"
- Check backend is running and accessible
- Verify `GEMINI_API_KEY` is set in backend `.env`
- Check network connectivity
- Review backend logs for errors

### No Audio Playback
- This means Google Cloud TTS is not configured
- You'll still see text transcriptions and responses
- To enable audio responses, add Google Cloud TTS credentials to backend

### "Failed to start recording"
- Ensure microphone permission is granted
- Try closing and reopening the app
- Check device microphone is working

### Audio Quality Issues
- Move to a quieter environment
- Speak clearly and at normal volume
- Hold phone's microphone towards your mouth
- Check microphone isn't blocked or damaged

## Benefits

### For Mental Health Support
- **More Natural**: Some users prefer speaking over typing
- **Faster**: Voice is quicker than typing long messages
- **Emotional Connection**: Hearing empathetic voice responses
- **Accessibility**: Better for users with typing difficulties
- **Privacy**: No on-screen text while recording

### User Experience
- Seamless switching between text and voice
- Visual feedback during recording
- Automatic transcription display
- Background audio processing
- Maintains full conversation context

## Future Enhancements

Potential improvements:
- [ ] Real-time streaming transcription
- [ ] Voice activity detection (auto-stop when silent)
- [ ] Multi-language support
- [ ] Emotion detection from voice tone
- [ ] Saved voice messages
- [ ] Playback speed control
- [ ] Background recording indicator

## Privacy & Security

- Audio is sent to backend via HTTPS
- Processed by Google Gemini API
- Not permanently stored on backend
- Transcriptions saved in chat history
- Audio files deleted after processing
- Same authentication as text messages

## Support

If you encounter issues:
1. Check backend logs: `npm run start:dev` in backend directory
2. Check mobile app console: Look for errors in Expo console
3. Verify API endpoint is correct
4. Test with text messages first to confirm backend works
5. Review backend `VOICE_SETUP.md` for configuration help
