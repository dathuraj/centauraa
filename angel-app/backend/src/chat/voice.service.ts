import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as textToSpeech from '@google-cloud/text-to-speech';
import * as speech from '@google-cloud/speech';

@Injectable()
export class VoiceService {
  private openai: OpenAI;
  private ttsClient: textToSpeech.TextToSpeechClient;
  private speechClient: speech.SpeechClient;

  constructor(private configService: ConfigService) {
    // Initialize OpenAI for audio processing
    const apiKey = this.configService.get('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }

    // Initialize TTS client for audio responses
    const credentials = this.configService.get('GOOGLE_CLOUD_CREDENTIALS');
    if (credentials) {
      const creds = JSON.parse(credentials);
      this.ttsClient = new textToSpeech.TextToSpeechClient({ credentials: creds });
      this.speechClient = new speech.SpeechClient({ credentials: creds });
    } else {
      // Fall back to default credentials (uses GOOGLE_APPLICATION_CREDENTIALS env var)
      this.ttsClient = new textToSpeech.TextToSpeechClient();
      this.speechClient = new speech.SpeechClient();
    }
  }

  /**
   * Transcribe audio using Google Cloud Speech-to-Text API
   * This is more accurate for pure speech transcription than Gemini
   */
  async transcribeAudio(audioBuffer: Buffer, mimeType: string = 'audio/wav'): Promise<string> {
    try {
      console.log(`[Speech-to-Text] Starting transcription - Format: ${mimeType}, Size: ${audioBuffer.length} bytes`);

      let actualSampleRate = 16000;
      let actualChannels = 1;
      let processedBuffer = audioBuffer;

      // Analyze and potentially extract audio from container formats
      if (mimeType === 'audio/wav' && audioBuffer.length > 44) {
        const header = audioBuffer.subarray(0, 44);
        actualSampleRate = header.readUInt32LE(24);
        actualChannels = header.readUInt16LE(22);
        const bitsPerSample = header.readUInt16LE(34);
        console.log(`[Speech-to-Text] WAV Header Analysis:`, {
          sampleRate: actualSampleRate,
          channels: actualChannels,
          bitsPerSample,
          dataSize: audioBuffer.length - 44
        });
      } else if (mimeType === 'audio/caf') {
        // CAF (Core Audio Format) - try to extract PCM data
        console.log('[Speech-to-Text] CAF format detected - attempting to extract raw PCM');
        // For LINEAR PCM in CAF, we can try to skip the header and send raw data
        // CAF headers are variable length, but typically the audio data starts after initial chunks
        // This is a simplified approach - may need refinement
        const cafSignature = audioBuffer.subarray(0, 4).toString('ascii');
        console.log(`[Speech-to-Text] CAF signature: ${cafSignature}`);
        // Keep full buffer for now as Google might handle it
        processedBuffer = audioBuffer;
        actualSampleRate = 16000; // We set this in recording config
        actualChannels = 1;
      }

      // Map mime types to Speech-to-Text encoding
      const encodingMap = {
        'audio/wav': speech.protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.LINEAR16,
        'audio/caf': speech.protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.LINEAR16,
        'audio/mp3': speech.protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.MP3,
        'audio/m4a': speech.protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.MP3,
        'audio/flac': speech.protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.FLAC,
        'audio/ogg': speech.protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.OGG_OPUS,
      };

      const encoding = encodingMap[mimeType] || speech.protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.LINEAR16;

      console.log(`[Speech-to-Text] Using encoding: ${encoding} for MIME type: ${mimeType}`);
      console.log(`[Speech-to-Text] Sample rate: ${actualSampleRate}, Channels: ${actualChannels}`);

      const audio = {
        content: processedBuffer.toString('base64'),
      };

      // Configuration using detected audio parameters
      const config: any = {
        encoding: encoding,
        sampleRateHertz: actualSampleRate,
        languageCode: 'en-US',
        enableAutomaticPunctuation: true,
        audioChannelCount: actualChannels,
      };

      const request = {
        audio: audio,
        config: config,
      };

      console.log('[Speech-to-Text] Config:', JSON.stringify(config, null, 2));
      console.log('[Speech-to-Text] Sending request to Google Cloud...');
      const [response] = await this.speechClient.recognize(request);

      console.log('[Speech-to-Text] Response received:', JSON.stringify(response, null, 2));

      if (!response.results || response.results.length === 0) {
        console.warn('[Speech-to-Text] No transcription results returned - audio may be silent or too short');
        return '';
      }

      // Combine all transcription results
      const transcription = response.results
        .map(result => result.alternatives?.[0]?.transcript || '')
        .join(' ')
        .trim();

      console.log(`[Speech-to-Text] Transcription successful: "${transcription}"`);
      return transcription;
    } catch (error) {
      console.error('[Speech-to-Text] Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        metadata: error.metadata,
        stack: error.stack,
      });
      throw new Error(`Failed to transcribe audio: ${error.message}`);
    }
  }

  /**
   * Process audio using OpenAI Whisper API (audio to text transcription)
   * Whisper handles various audio formats and provides accurate transcription
   */
  async processAudioWithWhisper(audioBuffer: Buffer, mimeType: string = 'audio/wav'): Promise<string> {
    try {
      if (!this.openai) {
        throw new Error('OPENAI_API_KEY not configured');
      }

      console.log(`[Whisper STT] Processing audio - Format: ${mimeType}, Size: ${audioBuffer.length} bytes`);

      // Check if buffer is actually empty or too small
      if (audioBuffer.length < 100) {
        console.error('[Whisper STT] Audio buffer is too small or empty');
        throw new Error('Audio file is too small or empty');
      }

      // Estimate audio duration (M4A/AAC is typically ~16KB per second at 128kbps)
      const estimatedDurationSeconds = audioBuffer.length / 16000;
      console.log(`[Whisper STT] Estimated audio duration: ${estimatedDurationSeconds.toFixed(1)} seconds`);

      // Log first few bytes to verify it's not all zeros (silent audio)
      const sampleBytes = audioBuffer.subarray(0, Math.min(100, audioBuffer.length));
      const isAllZeros = sampleBytes.every(byte => byte === 0);
      console.log(`[Whisper STT] First 20 bytes: ${audioBuffer.subarray(0, 20).toString('hex')}`);
      console.log(`[Whisper STT] Audio appears to be ${isAllZeros ? 'SILENT (all zeros)' : 'non-silent'}`);

      // Map MIME types to file extensions that Whisper expects
      const extensionMap = {
        'audio/wav': 'wav',
        'audio/caf': 'wav',  // Treat CAF as WAV (similar PCM format)
        'audio/mp3': 'mp3',
        'audio/m4a': 'm4a',
        'audio/flac': 'flac',
        'audio/ogg': 'ogg',
        'audio/webm': 'webm',
      };

      const extension = extensionMap[mimeType] || 'wav';

      console.log(`[Whisper STT] Sending to Whisper with file type: ${extension}`);

      // OpenAI Node.js SDK can work with buffers if we cast them properly
      // Create a file-like object using the toFile helper or by casting
      const fileData = audioBuffer as any;
      fileData.name = `audio.${extension}`;
      fileData.type = mimeType;

      const transcription = await this.openai.audio.transcriptions.create({
        file: fileData,
        model: 'whisper-1',
        language: 'en',
        response_format: 'text',
      });

      const result = transcription.trim();

      console.log(`[Whisper STT] Transcription: "${result}"`);

      if (result.length === 0) {
        console.warn('[Whisper STT] Empty transcription returned');
        return '';
      }

      return result;
    } catch (error) {
      console.error('[Whisper STT] Error processing audio:', error);
      throw new Error(`Failed to process audio: ${error.message}`);
    }
  }

  /**
   * Convert text to speech using Google Text-to-Speech
   */
  async textToSpeech(text: string, voiceName: string = 'en-US-Neural2-F'): Promise<Buffer> {
    try {
      const request = {
        input: { text: text },
        voice: {
          languageCode: 'en-US',
          name: voiceName, // Female voice, soothing for mental health app
          ssmlGender: textToSpeech.protos.google.cloud.texttospeech.v1.SsmlVoiceGender.FEMALE,
        },
        audioConfig: {
          audioEncoding: textToSpeech.protos.google.cloud.texttospeech.v1.AudioEncoding.MP3,
          speakingRate: 0.95, // Slightly slower for better comprehension
          pitch: 0.0,
        },
      };

      const [response] = await this.ttsClient.synthesizeSpeech(request);

      if (!response.audioContent) {
        throw new Error('No audio content received');
      }

      return Buffer.from(response.audioContent as Uint8Array);
    } catch (error) {
      console.error('Error in text-to-speech:', error);
      throw new Error('Failed to synthesize speech');
    }
  }

  /**
   * Detect MIME type from file buffer
   */
  detectMimeType(buffer: Buffer): string {
    // Simple detection based on common audio formats
    const header = buffer.subarray(0, 12).toString('hex');
    const extendedHeader = buffer.subarray(0, 16).toString('hex');

    console.log('[MIME Detection] File header (first 16 bytes):', extendedHeader);

    // CAF file detection (Core Audio Format - iOS default)
    if (header.startsWith('63616666')) { // 'caff' in hex
      console.log('[MIME Detection] Detected: audio/caf (iOS Core Audio Format)');
      return 'audio/caf';
    }

    // WAV file detection (RIFF...WAVE)
    if (header.startsWith('52494646') && buffer.subarray(0, 12).includes(Buffer.from('WAVE'))) {
      console.log('[MIME Detection] Detected: audio/wav');
      return 'audio/wav';
    }

    // MP3 file detection (ID3 tag or MPEG sync)
    if (header.startsWith('494433') || header.startsWith('fffb') || header.startsWith('fff3')) {
      console.log('[MIME Detection] Detected: audio/mp3');
      return 'audio/mp3';
    }

    // FLAC file detection
    if (header.startsWith('664c6143')) {
      console.log('[MIME Detection] Detected: audio/flac');
      return 'audio/flac';
    }

    // OGG file detection
    if (header.startsWith('4f676753')) {
      console.log('[MIME Detection] Detected: audio/ogg');
      return 'audio/ogg';
    }

    // M4A/MP4 audio detection (ftyp box)
    if (extendedHeader.includes('6674797069736f6d') || extendedHeader.includes('667479704d344120')) {
      console.log('[MIME Detection] Detected: audio/m4a');
      return 'audio/m4a';
    }

    // 3GP file detection (Android)
    if (extendedHeader.includes('667479703367')) {
      console.log('[MIME Detection] Detected: audio/3gp');
      return 'audio/3gp';
    }

    // Default - log for debugging
    console.warn('[MIME Detection] Unknown format, defaulting to audio/m4a for mobile compatibility');
    return 'audio/m4a'; // Changed default to m4a since it's more common for mobile
  }
}
