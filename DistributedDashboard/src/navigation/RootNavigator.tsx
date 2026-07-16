// src/navigation/RootNavigator.tsx
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import OTPScreen from '../screens/OTPScreen';       // ← NEW
import MainTabNavigator from './MainTabNavigator';
import WorkerDetailScreen from '../screens/WorkerDetailScreen';
import MasterNodeScreen from '../screens/MasterNodeScreen';
import ReassignmentScreen from '../screens/ReassignmentScreen';
import { useAuthStore, selectIsAuthenticated } from '../store/useAuthStore';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen                                    // ← NEW
            name="OTP"
            component={OTPScreen}
            options={{
              headerShown: true,
              title: 'Verify Email',
              headerBackTitle: 'Register',
            }}
          />
        </>
      ) : (
        <>
          <Stack.Screen name="MainTabs" component={MainTabNavigator} />
          <Stack.Screen
            name="WorkerDetail"
            component={WorkerDetailScreen}
            options={{ headerShown: true, title: 'Worker Details' }}
          />
          <Stack.Screen
            name="MasterNode"
            component={MasterNodeScreen}
            options={{ headerShown: true, title: 'Orchestrator' }}
          />
          <Stack.Screen
            name="Reassignment"
            component={ReassignmentScreen}
            options={{ headerShown: true, title: 'Reassign Workload' }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}