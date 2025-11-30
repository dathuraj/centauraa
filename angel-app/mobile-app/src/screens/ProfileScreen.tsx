import React, { useState } from 'react';
import { Box, VStack, Button, Text, Heading } from 'native-base';
import { useAuth } from '../context/AuthContext';
import { userAPI } from '../services/api';
import { Alert, TextInput, StyleSheet } from 'react-native';

export const ProfileScreen = () => {
  const { user, logout, refreshProfile } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [loading, setLoading] = useState(false);

  const handleUpdateProfile = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }

    setLoading(true);
    try {
      await userAPI.updateProfile(name);
      await refreshProfile();
      Alert.alert('Success', 'Profile updated successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      'Confirm Logout',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
          },
        },
      ]
    );
  };

  return (
    <Box flex={1} bg="white">
      <VStack space={4} px={6} py={6}>
        <Heading size="lg" mb={4}>Profile Settings</Heading>

        <VStack space={2}>
          <Text color="gray.600">Email</Text>
          <TextInput
            style={[styles.input, styles.disabled]}
            value={user?.email}
            editable={false}
          />
        </VStack>

        <VStack space={2}>
          <Text color="gray.600">Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your name"
            value={name}
            onChangeText={setName}
            placeholderTextColor="#9CA3AF"
          />
        </VStack>

        <Button
          onPress={handleUpdateProfile}
          isLoading={loading}
          size="lg"
          colorScheme="indigo"
          mt={2}
        >
          Update Profile
        </Button>

        <Button
          onPress={handleLogout}
          variant="outline"
          colorScheme="red"
          size="lg"
          mt={8}
        >
          Logout
        </Button>

        <Text fontSize="xs" color="gray.500" textAlign="center" mt={8}>
          Member since {new Date(user?.createdAt || '').toLocaleDateString()}
        </Text>
      </VStack>
    </Box>
  );
};

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: 'white',
  },
  disabled: {
    backgroundColor: '#F3F4F6',
  },
});
