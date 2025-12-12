import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { VoiceService } from './voice.service';

describe('VoiceService', () => {
  let service: VoiceService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        OPENAI_API_KEY: 'test-openai-key',
        GOOGLE_CLOUD_CREDENTIALS: null,
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoiceService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<VoiceService>(VoiceService);
    configService = module.get<ConfigService>(ConfigService);

    // Reset all mocks before each test
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('detectMimeType', () => {
    it('should detect CAF format (iOS)', () => {
      const cafHeader = Buffer.from('63616666', 'hex'); // 'caff' in hex
      const buffer = Buffer.concat([cafHeader, Buffer.alloc(100)]);

      const mimeType = service.detectMimeType(buffer);

      expect(mimeType).toBe('audio/caf');
    });

    it('should detect WAV format', () => {
      const wavHeader = Buffer.from('52494646', 'hex'); // 'RIFF'
      const waveMarker = Buffer.from('WAVE');
      const buffer = Buffer.concat([wavHeader, Buffer.alloc(4), waveMarker, Buffer.alloc(100)]);

      const mimeType = service.detectMimeType(buffer);

      expect(mimeType).toBe('audio/wav');
    });

    it('should detect MP3 format with ID3 tag', () => {
      const mp3Header = Buffer.from('494433', 'hex'); // 'ID3'
      const buffer = Buffer.concat([mp3Header, Buffer.alloc(100)]);

      const mimeType = service.detectMimeType(buffer);

      expect(mimeType).toBe('audio/mp3');
    });

    it('should detect FLAC format', () => {
      const flacHeader = Buffer.from('664c6143', 'hex'); // 'fLaC'
      const buffer = Buffer.concat([flacHeader, Buffer.alloc(100)]);

      const mimeType = service.detectMimeType(buffer);

      expect(mimeType).toBe('audio/flac');
    });

    it('should detect OGG format', () => {
      const oggHeader = Buffer.from('4f676753', 'hex'); // 'OggS'
      const buffer = Buffer.concat([oggHeader, Buffer.alloc(100)]);

      const mimeType = service.detectMimeType(buffer);

      expect(mimeType).toBe('audio/ogg');
    });

    it('should default to m4a for unknown formats', () => {
      const unknownBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

      const mimeType = service.detectMimeType(unknownBuffer);

      expect(mimeType).toBe('audio/m4a');
    });
  });

  describe('processAudioWithWhisper', () => {
    it('should transcribe audio using OpenAI Whisper', async () => {
      const audioBuffer = Buffer.alloc(1000);
      const mockOpenAI = {
        audio: {
          transcriptions: {
            create: jest.fn().mockResolvedValue('Hello, this is a test transcription'),
          },
        },
      };
      (service as any).openai = mockOpenAI;

      const result = await service.processAudioWithWhisper(audioBuffer, 'audio/wav');

      expect(result).toBe('Hello, this is a test transcription');
      expect(mockOpenAI.audio.transcriptions.create).toHaveBeenCalled();
    });

    it('should throw error if OpenAI is not configured', async () => {
      (service as any).openai = null;
      const audioBuffer = Buffer.alloc(1000);

      await expect(
        service.processAudioWithWhisper(audioBuffer, 'audio/wav'),
      ).rejects.toThrow('OPENAI_API_KEY not configured');
    });

    it('should throw error for empty audio buffer', async () => {
      const audioBuffer = Buffer.alloc(50); // Too small
      (service as any).openai = { audio: { transcriptions: { create: jest.fn() } } };

      await expect(
        service.processAudioWithWhisper(audioBuffer, 'audio/wav'),
      ).rejects.toThrow('Audio file is too small or empty');
    });

    it('should handle different audio formats', async () => {
      const audioBuffer = Buffer.alloc(1000);
      const mockOpenAI = {
        audio: {
          transcriptions: {
            create: jest.fn().mockResolvedValue('Transcription result'),
          },
        },
      };
      (service as any).openai = mockOpenAI;

      await service.processAudioWithWhisper(audioBuffer, 'audio/m4a');

      expect(mockOpenAI.audio.transcriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'whisper-1',
          language: 'en',
          response_format: 'text',
        }),
      );
    });

    it('should detect and warn about silent audio', async () => {
      const silentBuffer = Buffer.alloc(1000, 0); // All zeros = silent
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const mockOpenAI = {
        audio: {
          transcriptions: {
            create: jest.fn().mockResolvedValue(''),
          },
        },
      };
      (service as any).openai = mockOpenAI;

      const result = await service.processAudioWithWhisper(silentBuffer, 'audio/wav');

      expect(result).toBe('');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('SILENT (all zeros)'),
      );

      consoleSpy.mockRestore();
    });

    it('should handle Whisper API errors', async () => {
      const audioBuffer = Buffer.alloc(1000);
      const mockOpenAI = {
        audio: {
          transcriptions: {
            create: jest.fn().mockRejectedValue(new Error('API Error')),
          },
        },
      };
      (service as any).openai = mockOpenAI;

      await expect(
        service.processAudioWithWhisper(audioBuffer, 'audio/wav'),
      ).rejects.toThrow('Failed to process audio: API Error');
    });
  });

  describe('textToSpeech', () => {
    it('should convert text to speech', async () => {
      const mockAudioContent = Buffer.from('mock-audio-data');
      const mockTTSClient = {
        synthesizeSpeech: jest.fn().mockResolvedValue([
          {
            audioContent: mockAudioContent,
          },
        ]),
      };
      (service as any).ttsClient = mockTTSClient;

      const result = await service.textToSpeech('Hello, world!');

      expect(result).toBeInstanceOf(Buffer);
      expect(mockTTSClient.synthesizeSpeech).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { text: 'Hello, world!' },
          voice: expect.objectContaining({
            languageCode: 'en-US',
            name: 'en-US-Neural2-F',
          }),
          audioConfig: expect.objectContaining({
            audioEncoding: expect.anything(),
            speakingRate: 0.95,
            pitch: 0.0,
          }),
        }),
      );
    });

    it('should use custom voice name', async () => {
      const mockAudioContent = Buffer.from('mock-audio-data');
      const mockTTSClient = {
        synthesizeSpeech: jest.fn().mockResolvedValue([
          {
            audioContent: mockAudioContent,
          },
        ]),
      };
      (service as any).ttsClient = mockTTSClient;

      await service.textToSpeech('Test', 'en-US-Neural2-C');

      expect(mockTTSClient.synthesizeSpeech).toHaveBeenCalledWith(
        expect.objectContaining({
          voice: expect.objectContaining({
            name: 'en-US-Neural2-C',
          }),
        }),
      );
    });

    it('should throw error if no audio content received', async () => {
      const mockTTSClient = {
        synthesizeSpeech: jest.fn().mockResolvedValue([{}]),
      };
      (service as any).ttsClient = mockTTSClient;

      await expect(service.textToSpeech('Hello')).rejects.toThrow(
        'No audio content received',
      );
    });

    it('should handle TTS API errors', async () => {
      const mockTTSClient = {
        synthesizeSpeech: jest.fn().mockRejectedValue(new Error('TTS API Error')),
      };
      (service as any).ttsClient = mockTTSClient;

      await expect(service.textToSpeech('Hello')).rejects.toThrow(
        'Failed to synthesize speech',
      );
    });
  });

  describe('transcribeAudio (Google Speech-to-Text)', () => {
    it('should transcribe audio using Google Speech-to-Text', async () => {
      const audioBuffer = Buffer.alloc(1000);
      const mockSpeechClient = {
        recognize: jest.fn().mockResolvedValue([
          {
            results: [
              {
                alternatives: [
                  {
                    transcript: 'Test transcription',
                  },
                ],
              },
            ],
          },
        ]),
      };
      (service as any).speechClient = mockSpeechClient;

      const result = await service.transcribeAudio(audioBuffer, 'audio/wav');

      expect(result).toBe('Test transcription');
      expect(mockSpeechClient.recognize).toHaveBeenCalled();
    });

    it('should return empty string for no results', async () => {
      const audioBuffer = Buffer.alloc(1000);
      const mockSpeechClient = {
        recognize: jest.fn().mockResolvedValue([{ results: [] }]),
      };
      (service as any).speechClient = mockSpeechClient;

      const result = await service.transcribeAudio(audioBuffer, 'audio/wav');

      expect(result).toBe('');
    });

    it('should handle WAV header parsing', async () => {
      // Create a valid WAV header
      const wavHeader = Buffer.alloc(44);
      wavHeader.write('RIFF', 0);
      wavHeader.writeUInt32LE(16000, 24); // Sample rate
      wavHeader.writeUInt16LE(1, 22); // Channels
      wavHeader.writeUInt16LE(16, 34); // Bits per sample

      const audioBuffer = Buffer.concat([wavHeader, Buffer.alloc(1000)]);
      const mockSpeechClient = {
        recognize: jest.fn().mockResolvedValue([
          {
            results: [
              {
                alternatives: [
                  {
                    transcript: 'WAV transcription',
                  },
                ],
              },
            ],
          },
        ]),
      };
      (service as any).speechClient = mockSpeechClient;

      const result = await service.transcribeAudio(audioBuffer, 'audio/wav');

      expect(result).toBe('WAV transcription');
    });

    it('should handle Speech-to-Text errors', async () => {
      const audioBuffer = Buffer.alloc(1000);
      const mockSpeechClient = {
        recognize: jest.fn().mockRejectedValue(new Error('Speech API Error')),
      };
      (service as any).speechClient = mockSpeechClient;

      await expect(service.transcribeAudio(audioBuffer, 'audio/wav')).rejects.toThrow(
        'Failed to transcribe audio',
      );
    });

    it('should handle CAF format', async () => {
      const cafHeader = Buffer.from('63616666', 'hex');
      const audioBuffer = Buffer.concat([cafHeader, Buffer.alloc(1000)]);
      const mockSpeechClient = {
        recognize: jest.fn().mockResolvedValue([
          {
            results: [
              {
                alternatives: [
                  {
                    transcript: 'CAF transcription',
                  },
                ],
              },
            ],
          },
        ]),
      };
      (service as any).speechClient = mockSpeechClient;

      const result = await service.transcribeAudio(audioBuffer, 'audio/caf');

      expect(result).toBe('CAF transcription');
    });
  });

  describe('Initialization', () => {
    it('should initialize with OpenAI API key', () => {
      expect((service as any).openai).toBeDefined();
    });

    it('should initialize TTS and Speech clients', () => {
      expect((service as any).ttsClient).toBeDefined();
      expect((service as any).speechClient).toBeDefined();
    });
  });
});
