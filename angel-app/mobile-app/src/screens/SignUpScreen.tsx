import React, { useState } from 'react';
import { Box, VStack, Button, Text, Heading } from 'native-base';
import { useAuth } from '../context/AuthContext';
import { Alert, TextInput, StyleSheet } from 'react-native';

export const SignUpScreen = ({ navigation }: any) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();

  const handleSignUp = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }

    setLoading(true);
    try {
      await signUp(email);
      Alert.alert('Success', 'OTP sent to your email');
      navigation.navigate('OTPVerification', { email });
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box flex={1} bg="white">
      <VStack space={4} px={6} py={8}>
        <Heading size="xl" mb={4}>Welcome to Angel</Heading>
        <Text fontSize="md" color="gray.600" mb={4}>
          Your compassionate AI mental health companion
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Email address"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor="#9CA3AF"
        />

        <Button
          onPress={handleSignUp}
          isLoading={loading}
          size="lg"
          colorScheme="indigo"
        >
          Get Started
        </Button>

        <Button
          variant="link"
          onPress={() => navigation.navigate('Login')}
          mt={2}
        >
          Already have an account? Log in
        </Button>
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
});
