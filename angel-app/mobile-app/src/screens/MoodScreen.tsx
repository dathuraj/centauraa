import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, VStack, Text, Button, Heading, HStack, ScrollView } from 'native-base';
import { Ionicons } from '@expo/vector-icons';
import { moodAPI } from '../services/api';
import { MoodLog, MoodStats } from '../types';
import { Alert } from 'react-native';

const MOOD_EMOJIS = ['😢', '😕', '😐', '🙂', '😊'];

export const MoodScreen = () => {
  const [selectedMood, setSelectedMood] = useState<number | null>(null);
  const [moodHistory, setMoodHistory] = useState<MoodLog[]>([]);
  const [stats, setStats] = useState<MoodStats | null>(null);
  const [loading, setLoading] = useState(false);
  const hasLoadedData = useRef(false);

  useEffect(() => {
    // Only load data once on mount
    if (!hasLoadedData.current) {
      loadMoodData();
      hasLoadedData.current = true;
    }
  }, []);

  const loadMoodData = async () => {
    try {
      const [historyRes, statsRes] = await Promise.all([
        moodAPI.getHistory(7),
        moodAPI.getStats(7),
      ]);
      setMoodHistory(historyRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Failed to load mood data:', error);
    }
  };

  const logMood = useCallback(async () => {
    if (selectedMood === null) {
      Alert.alert('Error', 'Please select a mood');
      return;
    }

    setLoading(true);
    try {
      await moodAPI.logMood(selectedMood + 1);
      Alert.alert('Success', 'Mood logged successfully');
      setSelectedMood(null);
      loadMoodData();
    } catch (error) {
      Alert.alert('Error', 'Failed to log mood');
    } finally {
      setLoading(false);
    }
  }, [selectedMood]);

  return (
    <ScrollView flex={1} bg="white">
      <VStack space={6} px={6} py={6}>
        <Heading size="lg">How are you feeling today?</Heading>

        {/* Mood Selector */}
        <HStack space={3} justifyContent="center">
          {MOOD_EMOJIS.map((emoji, index) => (
            <Button
              key={index}
              size="lg"
              variant={selectedMood === index ? 'solid' : 'outline'}
              colorScheme="indigo"
              onPress={() => setSelectedMood(index)}
              px={4}
            >
              <Text fontSize="2xl">{emoji}</Text>
            </Button>
          ))}
        </HStack>

        <Button
          onPress={logMood}
          isLoading={loading}
          colorScheme="indigo"
          size="lg"
        >
          Log Mood
        </Button>

        {/* Stats */}
        {stats && (
          <Box bg="gray.100" p={4} borderRadius="lg">
            <Heading size="sm" mb={2}>7-Day Summary</Heading>
            <HStack justifyContent="space-between" mb={2}>
              <Text>Average:</Text>
              <Text bold>{stats.average.toFixed(1)} / 5</Text>
            </HStack>
            <HStack justifyContent="space-between">
              <Text>Trend:</Text>
              <HStack alignItems="center" space={1}>
                <Ionicons
                  name={
                    stats.trend === 'improving' ? 'trending-up' :
                    stats.trend === 'declining' ? 'trending-down' :
                    'remove'
                  }
                  size={16}
                  color={
                    stats.trend === 'improving' ? 'green' :
                    stats.trend === 'declining' ? 'red' :
                    'gray'
                  }
                />
                <Text bold color={
                  stats.trend === 'improving' ? 'green.600' :
                  stats.trend === 'declining' ? 'red.600' :
                  'gray.600'
                }>
                  {stats.trend.charAt(0).toUpperCase() + stats.trend.slice(1)}
                </Text>
              </HStack>
            </HStack>
          </Box>
        )}

        {/* History */}
        <VStack space={3}>
          <Heading size="sm">Recent Moods</Heading>
          {moodHistory.map((log) => (
            <HStack key={log.id} justifyContent="space-between" bg="gray.50" p={3} borderRadius="md">
              <Text fontSize="2xl">{MOOD_EMOJIS[log.mood - 1]}</Text>
              <Text color="gray.600">
                {new Date(log.createdAt).toLocaleDateString()}
              </Text>
            </HStack>
          ))}
        </VStack>
      </VStack>
    </ScrollView>
  );
};
