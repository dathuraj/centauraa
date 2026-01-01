import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { SignUpScreen } from '../screens/SignUpScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { OTPVerificationScreen } from '../screens/OTPVerificationScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { ConversationHistoryScreen } from '../screens/ConversationHistoryScreen';
import { MoodScreen } from '../screens/MoodScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { Box, Spinner } from 'native-base';
import { TouchableOpacity } from 'react-native';

// Define navigation param lists
export type ChatStackParamList = {
  ChatMain: { conversationId?: string } | undefined;
  ConversationHistory: undefined;
};

export type ChatStackNavigationProp = NativeStackNavigationProp<ChatStackParamList>;

const AuthStack = createNativeStackNavigator();
const ChatStack = createNativeStackNavigator<ChatStackParamList>();
const Tab = createBottomTabNavigator();

function AuthStackNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="SignUp" component={SignUpScreen} />
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="OTPVerification" component={OTPVerificationScreen} />
    </AuthStack.Navigator>
  );
}

function ChatStackNavigator() {
  return (
    <ChatStack.Navigator>
      <ChatStack.Screen
        name="ChatMain"
        component={ChatScreen}
        options={({ navigation }) => ({
          headerTitle: 'Angel',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => navigation.navigate('ConversationHistory')}
              style={{ marginRight: 10 }}
            >
              <Ionicons name="list" size={24} color="#4F46E5" />
            </TouchableOpacity>
          ),
        })}
      />
      <ChatStack.Screen
        name="ConversationHistory"
        component={ConversationHistoryScreen}
        options={{
          headerTitle: 'Conversations',
          headerBackTitle: 'Back',
        }}
      />
    </ChatStack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: any;

          if (route.name === 'Chat') {
            iconName = focused ? 'chatbubble' : 'chatbubble-outline';
          } else if (route.name === 'Mood') {
            iconName = focused ? 'happy' : 'happy-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#4F46E5',
        tabBarInactiveTintColor: 'gray',
        headerShown: false,
      })}
    >
      <Tab.Screen
        name="Chat"
        component={ChatStackNavigator}
      />
      <Tab.Screen
        name="Mood"
        component={MoodScreen}
        options={{ headerShown: true, headerTitle: 'Mood Tracker' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ headerShown: true, headerTitle: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Box flex={1} justifyContent="center" alignItems="center">
        <Spinner size="lg" />
      </Box>
    );
  }

  return (
    <NavigationContainer>
      {user ? <MainTabs /> : <AuthStackNavigator />}
    </NavigationContainer>
  );
}
