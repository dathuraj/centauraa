import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { Box, VStack, HStack, IconButton, Text } from 'native-base';
import { Ionicons } from '@expo/vector-icons';
import { chatAPI, voiceAPI } from '../services/api';
import { Message } from '../types';
import { Alert, KeyboardAvoidingView, Platform, ScrollView as RNScrollView, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { Audio } from 'expo-av';
import { useRoute, useNavigation } from '@react-navigation/native';

// Memoized Message Component to prevent unnecessary re-renders
const MessageItem = memo(({ msg }: { msg: Message }) => (
  <HStack
    justifyContent={msg.senderType === 'USER' ? 'flex-end' : 'flex-start'}
  >
    <Box
      bg={msg.senderType === 'USER' ? 'indigo.600' : 'gray.200'}
      px={4}
      py={3}
      borderRadius="2xl"
      maxW="80%"
    >
      <Text color={msg.senderType === 'USER' ? 'white' : 'black'}>
        {msg.content}
      </Text>
    </Box>
  </HStack>
));

export const ChatScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const conversationId = (route.params as any)?.conversationId;

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('text');
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const scrollViewRef = useRef<RNScrollView>(null);
  const hasLoadedHistory = useRef(false);

  useEffect(() => {
    // Load conversation when conversationId changes
    if (conversationId) {
      loadConversation(conversationId);
    } else {
      // Clear messages for new conversation
      setMessages([]);
    }
    hasLoadedHistory.current = true;
  }, [conversationId]);

  useEffect(() => {
    setupAudio();

    return () => {
      // Cleanup
      if (sound) {
        sound.unloadAsync();
      }
      if (recording) {
        recording.stopAndUnloadAsync();
      }
    };
  }, []);

  const setupAudio = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
    } catch (error) {
      console.error('Failed to setup audio:', error);
    }
  };

  const loadConversation = async (convId: string) => {
    try {
      const response = await chatAPI.getConversation(convId);
      if (response.data.messages) {
        setMessages(response.data.messages);
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
      Alert.alert('Error', 'Failed to load conversation');
    }
  };

  const loadHistory = async () => {
    try {
      const response = await chatAPI.getHistory(50);
      setMessages(response.data.reverse());
    } catch (error) {
      console.error('Failed to load chat history:', error);
    }
  };

  const sendMessage = useCallback(async () => {
    if (!inputText.trim()) return;

    const userMessage = inputText;
    setInputText('');

    // Add user message to UI
    const tempUserMsg: Message = {
      id: Date.now().toString(),
      content: userMessage,
      senderType: 'USER',
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    setIsTyping(true);
    setLoading(true);

    try {
      const response = await chatAPI.sendMessage(userMessage, conversationId);
      setMessages((prev) => [...prev, response.data]);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to send message');
      console.error(error);
    } finally {
      setIsTyping(false);
      setLoading(false);
    }
  }, [inputText, conversationId]);

  const startRecording = async () => {
    try {
      // Check if running on simulator
      if (Platform.OS === 'ios' && !Platform.isPad) {
        const isSimulator = await (async () => {
          try {
            // Simple check: simulators often have specific device names
            return Platform.constants?.interfaceIdiom === 'phone';
          } catch {
            return false;
          }
        })();

        // Show warning on first record (optional)
        console.warn('Note: Voice recording on iOS simulator may not work properly. Test on a real device for best results.');
      }

      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant microphone permission to record audio');
        return;
      }

      setIsRecording(true);
      // Use HIGH_QUALITY preset which works well with Gemini's audio processing
      // Gemini can handle various audio formats (CAF, M4A, etc.)
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Error', 'Failed to start recording');
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      setIsRecording(false);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (uri) {
        await sendVoiceMessage(uri);
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
      Alert.alert('Error', 'Failed to stop recording');
    }
  };

  const sendVoiceMessage = async (audioUri: string) => {
    setIsTyping(true);
    setLoading(true);

    try {
      const response = await voiceAPI.sendVoiceMessage(audioUri);

      // Check if response has the expected structure
      if (!response.data || !response.data.success) {
        throw new Error(response.data?.error || 'Failed to process voice message');
      }

      const data = response.data.data;

      // Validate data exists
      if (!data || !data.userTranscription) {
        throw new Error('Invalid response format from server');
      }

      // Add user's transcribed message
      const userMsg: Message = {
        id: Date.now().toString(),
        content: data.userTranscription,
        senderType: 'USER',
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      // Add bot's response message
      const botMsg: Message = {
        id: data.messageId,
        content: data.botResponse,
        senderType: 'BOT',
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, botMsg]);

      // Play audio response
      if (data.audioBase64) {
        await playAudioResponse(data.audioBase64);
      }
    } catch (error: any) {
      console.error('Voice message error:', error);
      const errorMessage = error.response?.data?.error
        || error.response?.data?.details
        || error.message
        || 'Failed to send voice message';
      Alert.alert('Error', errorMessage);
    } finally {
      setIsTyping(false);
      setLoading(false);
    }
  };

  const playAudioResponse = async (audioBase64: string) => {
    try {
      // Unload previous sound if exists
      if (sound) {
        await sound.unloadAsync();
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: `data:audio/mp3;base64,${audioBase64}` },
        { shouldPlay: true }
      );
      setSound(newSound);

      // Cleanup when done
      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          newSound.unloadAsync();
          setSound(null);
        }
      });
    } catch (error) {
      console.error('Failed to play audio:', error);
    }
  };

  const toggleInputMode = useCallback(() => {
    setInputMode((prev) => (prev === 'text' ? 'voice' : 'text'));
  }, []);

  // Debounced scroll to end to prevent lag
  const scrollToEnd = useCallback(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      style={{ flex: 1 }}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <Box flex={1} bg="white">
        <RNScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollViewContent}
          onContentSizeChange={scrollToEnd}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={true}
        >
          <VStack space={3}>
            {messages.map((msg) => (
              <MessageItem key={msg.id} msg={msg} />
            ))}
            {isTyping && (
              <HStack justifyContent="flex-start">
                <Box bg="gray.200" px={4} py={3} borderRadius="2xl">
                  <Text color="gray.600">Angel is typing...</Text>
                </Box>
              </HStack>
            )}
          </VStack>
        </RNScrollView>

        <HStack px={4} py={3} space={2} alignItems="flex-end" borderTopWidth={1} borderColor="gray.200">
          {/* Toggle button */}
          <IconButton
            icon={
              <Ionicons
                name={inputMode === 'text' ? 'mic-outline' : 'text-outline'}
                size={24}
                color="#6366F1"
              />
            }
            onPress={toggleInputMode}
            isDisabled={loading || isRecording}
          />

          {inputMode === 'text' ? (
            <>
              <TextInput
                style={styles.input}
                placeholder="Type your message..."
                value={inputText}
                onChangeText={setInputText}
                editable={!loading}
                placeholderTextColor="#9CA3AF"
                multiline={true}
                numberOfLines={4}
                textAlignVertical="top"
                blurOnSubmit={false}
              />
              <IconButton
                icon={<Ionicons name="send" size={24} color={loading ? 'gray' : '#6366F1'} />}
                onPress={sendMessage}
                isDisabled={loading || !inputText.trim()}
              />
            </>
          ) : (
            <>
              <Box flex={1} alignItems="center" justifyContent="center">
                <Text color={isRecording ? 'red.500' : 'gray.600'} fontSize="sm">
                  {isRecording ? 'Recording... Release to send' : 'Hold to record'}
                </Text>
              </Box>
              <TouchableOpacity
                onPressIn={startRecording}
                onPressOut={stopRecording}
                disabled={loading}
                style={[
                  styles.micButton,
                  isRecording && styles.micButtonActive,
                  loading && styles.micButtonDisabled,
                ]}
              >
                <Ionicons
                  name={isRecording ? 'stop-circle' : 'mic'}
                  size={32}
                  color="white"
                />
              </TouchableOpacity>
            </>
          )}
        </HStack>
      </Box>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    padding: 16,
    flexGrow: 1,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    paddingTop: 12,
    fontSize: 16,
    backgroundColor: 'white',
    minHeight: 44,
    maxHeight: 120,
  },
  micButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  micButtonActive: {
    backgroundColor: '#EF4444',
    transform: [{ scale: 1.1 }],
  },
  micButtonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.5,
  },
});
