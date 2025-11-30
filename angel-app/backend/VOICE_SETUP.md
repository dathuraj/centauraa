# Voice Chat Setup Guide

This guide explains how to set up voice support for the Angel mental health companion app.

## Features

The voice chat system provides:
- **Audio Processing with Gemini**: Uses Gemini's multimodal capabilities to directly process audio (speech-to-text)
- **Text-to-Speech**: Convert AI responses back to natural-sounding audio
- **Full conversation flow**: Send voice, get voice response with conversation memory
- **Multiple audio formats**: Supports WAV, MP3, FLAC, OGG, M4A

## Prerequisites

1. **Google Gemini API Key** (for audio transcription) - Already configured in your `.env`
2. **Google Cloud Text-to-Speech API** (for audio responses)
   - Optional: Can be skipped if you only need transcription

## Setup Instructions

### Option A: Basic Setup (Transcription Only - FREE)

If you only need audio transcription, you're already set! The system uses your existing `GEMINI_API_KEY` for audio processing.

**Your `.env` should have:**
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

**What works with this setup:**
- ✅ Audio transcription via `/voice/transcribe` endpoint
- ❌ Text-to-speech responses (needs Google Cloud TTS)

### Option B: Full Voice Chat Setup (With Audio Responses)

For complete voice conversations with audio responses:

#### 1. Enable Google Cloud Text-to-Speech API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the [Cloud Text-to-Speech API](https://console.cloud.google.com/apis/library/texttospeech.googleapis.com)

#### 2. Create Service Account Credentials

1. Go to **IAM & Admin > Service Accounts**
2. Click **Create Service Account**
3. Name it (e.g., "angel-tts-service")
4. Grant the role: **Cloud Text-to-Speech Client**
5. Click **Create Key** and choose **JSON**
6. Download the JSON key file

#### 3. Configure Environment Variables

Add to your `.env` file:

```env
# Gemini API (already configured)
GEMINI_API_KEY=your_gemini_api_key_here

# Google Cloud TTS - Option 1: Inline credentials
GOOGLE_CLOUD_CREDENTIALS='{"type":"service_account","project_id":"your-project","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}'

# Google Cloud TTS - Option 2: File path (recommended for production)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/credentials.json
```

**What works with this setup:**
- ✅ Audio transcription
- ✅ Text-to-speech responses
- ✅ Full voice conversation flow

## API Endpoints

### 1. Send Voice Message

**Endpoint**: `POST /voice/message`

**Headers**:
- `Authorization: Bearer <your_jwt_token>`
- `Content-Type: multipart/form-data`

**Body**:
- `audio`: Audio file (WAV, FLAC, or other supported formats)

**Response**:
```json
{
  "success": true,
  "data": {
    "userTranscription": "How are you today?",
    "botResponse": "I'm here to support you. How are you feeling?",
    "audioBase64": "//uQx...",
    "messageId": "uuid"
  }
}
```

### 2. Text-to-Speech (Synthesize)

**Endpoint**: `POST /voice/synthesize`

**Headers**:
- `Authorization: Bearer <your_jwt_token>`
- `Content-Type: application/json`

**Body**:
```json
{
  "text": "Hello, how can I help you today?"
}
```

**Response**: Audio file (MP3)

### 3. Transcribe Only

**Endpoint**: `POST /voice/transcribe`

**Headers**:
- `Authorization: Bearer <your_jwt_token>`
- `Content-Type: multipart/form-data`

**Body**:
- `audio`: Audio file

**Response**:
```json
{
  "success": true,
  "data": {
    "transcription": "How are you today?"
  }
}
```

## Frontend Integration Example

### React/React Native

```javascript
// Send voice message
const sendVoiceMessage = async (audioBlob) => {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.wav');

  const response = await fetch('http://your-api/voice/message', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  const result = await response.json();

  if (result.success) {
    // Play the audio response
    const audio = new Audio(`data:audio/mp3;base64,${result.data.audioBase64}`);
    audio.play();

    // Display text
    console.log('User said:', result.data.userTranscription);
    console.log('Bot replied:', result.data.botResponse);
  }
};

// Get text-to-speech
const synthesizeSpeech = async (text) => {
  const response = await fetch('http://your-api/voice/synthesize', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  const audioBlob = await response.blob();
  const audio = new Audio(URL.createObjectURL(audioBlob));
  audio.play();
};
```

## Supported Audio Formats

Gemini's multimodal API supports a wide range of audio formats:

- **WAV** (audio/wav) - Recommended for recording
- **MP3** (audio/mp3)
- **FLAC** (audio/flac)
- **OGG** (audio/ogg)
- **M4A/MP4** (audio/mp4)
- **WebM** (audio/webm)

## Voice Configuration

The default voice is configured as:
- **Voice**: `en-US-Neural2-F` (Female, soothing)
- **Speaking Rate**: 0.95 (slightly slower for better comprehension)
- **Language**: English (US)

To change the voice, modify `voice.service.ts`:

```typescript
async textToSpeech(text: string, voiceName: string = 'en-US-Neural2-C') {
  // Use different voice name
}
```

Available voices:
- `en-US-Neural2-F` - Female (default, warm and empathetic)
- `en-US-Neural2-C` - Male (calm and reassuring)
- `en-US-Neural2-A` - Male (professional)
- `en-US-Neural2-E` - Female (energetic)

See [Google Cloud TTS Voices](https://cloud.google.com/text-to-speech/docs/voices) for more options.

## Cost Considerations

### Pricing (as of 2024)

**Gemini API (Audio Processing)**:
- Gemini 1.5 Flash: FREE up to 15 RPM (requests per minute)
- Gemini 1.5 Flash: $0.075 per 1M input tokens after free tier
- Audio is typically ~32 tokens per second
- Example: 1 minute of audio ≈ 1,920 tokens ≈ $0.00014

**Text-to-Speech** (Optional):
- First 1 million characters/month: FREE (Neural2 voices)
- After that: $16 per 1 million characters
- Average response: ~100 characters = $0.0016

**Comparison with Google Cloud Speech-to-Text**:
- Old approach: $0.006 per 15 seconds = $0.024 per minute
- **New approach: ~$0.00014 per minute** (170x cheaper!)

For a mental health app, the Gemini free tier should easily cover hundreds of voice conversations per day.

## Troubleshooting

### "Failed to process audio"
- Check that audio format is supported (WAV, MP3, FLAC, OGG, M4A)
- Verify `GEMINI_API_KEY` is set in `.env`
- Check audio file size (Gemini has limits on file size)
- Ensure audio is clear and not corrupted

### "Failed to synthesize speech"
- Verify Google Cloud TTS credentials are configured
- Ensure Text-to-Speech API is enabled in Google Cloud
- Check that the voice name is valid (`en-US-Neural2-F` by default)

### "No audio file provided"
- Ensure the form field is named `audio`
- Check that the file is being sent as `multipart/form-data`
- Verify file is not empty

### "GEMINI_API_KEY not configured"
- Add `GEMINI_API_KEY` to your `.env` file
- Restart the backend server after adding the key

## Security Notes

1. **Never commit credentials to Git**: Use `.env` files and add them to `.gitignore`
2. **Rotate keys regularly**: Create new service account keys periodically
3. **Use least privilege**: Only grant necessary permissions to service accounts
4. **Validate input**: The API validates audio file sizes and formats

## Benefits of Multimodal Approach

1. **Simpler Setup**: Uses your existing Gemini API key
2. **Much Cheaper**: 170x less expensive than Google Cloud Speech-to-Text
3. **Better Quality**: Gemini understands context, accents, and nuances better
4. **More Formats**: Supports more audio formats out of the box
5. **Unified API**: One API for both chat and audio processing

## Next Steps

- Add real-time streaming for faster responses
- Implement voice activity detection
- Add multi-language support (Gemini supports 100+ languages)
- Cache frequently used TTS responses
- Add emotion detection from voice tone
