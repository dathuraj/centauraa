import axios from 'axios';

const API_URL = 'http://localhost:3000';

async function testRAG() {
  try {
    console.log('=== Testing RAG Implementation ===\n');

    // First, let's register or login a test user
    const testEmail = 'ragtest@example.com';

    console.log('1. Registering test user...');
    try {
      await axios.post(`${API_URL}/auth/register`, { email: testEmail });
      console.log('   ✓ Registration initiated\n');
    } catch (error: any) {
      if (error.response?.status === 400) {
        console.log('   ✓ User already exists\n');
      } else {
        throw error;
      }
    }

    // For testing, we'll use an existing user token or you can manually provide one
    console.log('\n⚠️  Please provide a valid JWT token for testing:');
    console.log('   You can get one by:');
    console.log('   1. Logging in via the mobile app');
    console.log('   2. Or running: curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" -d \'{"email":"test@example.com"}\'');
    console.log('   3. Then verify with the OTP sent to email\n');

    // Example: const token = 'your-jwt-token-here';
    // Uncomment and add your token to test
    //
    // const testMessage = 'I\'m feeling anxious about work today';
    // console.log(`2. Sending test message: "${testMessage}"`);
    //
    // const response = await axios.post(
    //   `${API_URL}/chat/send`,
    //   { message: testMessage },
    //   { headers: { Authorization: `Bearer ${token}` } }
    // );
    //
    // console.log('\n=== Response ===');
    // console.log(response.data);
    // console.log('\n✓ RAG test completed successfully!');
  } catch (error: any) {
    console.error('Error testing RAG:', error.response?.data || error.message);
  }
}

testRAG();
