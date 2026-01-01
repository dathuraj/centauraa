import React, { useState, useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Pressable,
  Spinner,
} from 'native-base';
import { Ionicons } from '@expo/vector-icons';
import { chatAPI } from '../services/api';
import { Conversation } from '../types';
import { Alert, RefreshControl, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { ChatStackNavigationProp } from '../navigation/AppNavigator';

export const ConversationHistoryScreen = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation<ChatStackNavigationProp>();

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      setLoading(true);
      const response = await chatAPI.getConversations(50);
      setConversations(response.data);
    } catch (error) {
      console.error('Failed to load conversations:', error);
      Alert.alert('Error', 'Failed to load conversation history');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadConversations();
    setRefreshing(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return 'Today';
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return `${days} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const handleNewConversation = () => {
    // Navigate to chat with no conversationId (creates new conversation)
    navigation.navigate('ChatMain', { conversationId: undefined });
  };

  const handleSelectConversation = (conversationId: string) => {
    navigation.navigate('ChatMain', { conversationId });
  };

  if (loading) {
    return (
      <Box flex={1} justifyContent="center" alignItems="center" bg="white">
        <Spinner size="lg" />
      </Box>
    );
  }

  return (
    <Box flex={1} bg="white">
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <VStack space={0} divider={<Box h="1" bg="gray.100" />}>
          {/* New Conversation Button */}
          <Pressable
            onPress={handleNewConversation}
            bg="indigo.50"
            _pressed={{ bg: 'indigo.100' }}
          >
            <HStack
              px={4}
              py={4}
              alignItems="center"
              space={3}
            >
              <Box
                bg="indigo.600"
                p={2}
                borderRadius="full"
              >
                <Ionicons name="add" size={24} color="white" />
              </Box>
              <VStack flex={1}>
                <Text fontSize="lg" fontWeight="bold" color="indigo.600">
                  Start New Conversation
                </Text>
                <Text fontSize="sm" color="gray.600">
                  Begin a fresh chat with Angel
                </Text>
              </VStack>
              <Ionicons name="chevron-forward" size={20} color="#6366F1" />
            </HStack>
          </Pressable>

          {/* Conversation List */}
          {conversations.length === 0 ? (
            <Box px={4} py={8} alignItems="center">
              <Ionicons name="chatbubbles-outline" size={64} color="#D1D5DB" />
              <Text mt={4} fontSize="lg" color="gray.500" textAlign="center">
                No conversations yet
              </Text>
              <Text mt={2} fontSize="sm" color="gray.400" textAlign="center">
                Start a new conversation to begin chatting with Angel
              </Text>
            </Box>
          ) : (
            conversations.map((conversation) => (
              <Pressable
                key={conversation.id}
                onPress={() => handleSelectConversation(conversation.id)}
                _pressed={{ bg: 'gray.100' }}
              >
                <HStack
                  px={4}
                  py={4}
                  alignItems="center"
                  space={3}
                >
                  <Box
                    bg="gray.200"
                    p={2}
                    borderRadius="full"
                  >
                    <Ionicons name="chatbubble" size={20} color="#6366F1" />
                  </Box>
                  <VStack flex={1} space={1}>
                    <Text fontSize="md" fontWeight="semibold" numberOfLines={1}>
                      {conversation.title}
                    </Text>
                    <Text fontSize="xs" color="gray.500">
                      {formatDate(conversation.updatedAt)}
                    </Text>
                  </VStack>
                  <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                </HStack>
              </Pressable>
            ))
          )}
        </VStack>
      </ScrollView>
    </Box>
  );
};
