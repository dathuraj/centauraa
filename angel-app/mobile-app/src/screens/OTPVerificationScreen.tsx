import React, { useState } from 'react';
import { Box, VStack, Button, Text, Heading } from 'native-base';
import { useAuth } from '../context/AuthContext';
import { Alert, TextInput, StyleSheet } from 'react-native';

export const OTPVerificationScreen = ({ route, navigation }: any) => {
  const { email } = route.params;
  const [otp, setOTP] = useState('');
  const [loading, setLoading] = useState(false);
  const { verifyOTP } = useAuth();

  const handleVerify = async () => {
    if (!otp || otp.length !== 6) {
      Alert.alert('Error', 'Please enter the 6-digit OTP');
      return;
    }

    setLoading(true);
    try {
      await verifyOTP(email, otp);
      // Navigation handled by AuthContext state change
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box flex={1} bg="white">
      <VStack space={4} px={6} py={8}>
        <Heading size="xl" mb={4}>Verify Your Email</Heading>
        <Text fontSize="md" color="gray.600" mb={4}>
          We've sent a 6-digit code to {email}
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Enter OTP"
          value={otp}
          onChangeText={setOTP}
          keyboardType="number-pad"
          maxLength={6}
          placeholderTextColor="#9CA3AF"
        />

        <Button
          onPress={handleVerify}
          isLoading={loading}
          size="lg"
          colorScheme="indigo"
        >
          Verify
        </Button>

        <Button variant="link" mt={2}>
          Didn't receive the code? Resend
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
