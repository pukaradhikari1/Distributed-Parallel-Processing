// src/navigation/RootNavigator.tsx
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { IconButton } from 'react-native-paper';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
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
          <Stack.Screen
            name="Register"
            component={RegisterScreen}
            options={({ navigation }) => ({
              headerShown: true,
              title: 'Create Account',
              headerLeft: () => (
                <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
              ),
            })}
          />
        </>
      ) : (
        <>
          <Stack.Screen name="MainTabs" component={MainTabNavigator} />
          <Stack.Screen
            name="WorkerDetail"
            component={WorkerDetailScreen}
            options={({ navigation }) => ({
              headerShown: true,
              title: 'Worker Details',
              headerLeft: () => (
                <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
              ),
            })}
          />
          <Stack.Screen
            name="MasterNode"
            component={MasterNodeScreen}
            options={({ navigation }) => ({
              headerShown: true,
              title: 'Orchestrator',
              headerLeft: () => (
                <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
              ),
            })}
          />
          <Stack.Screen
            name="Reassignment"
            component={ReassignmentScreen}
            options={({ navigation }) => ({
              headerShown: true,
              title: 'Reassign Workload',
              headerLeft: () => (
                <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
              ),
            })}
          />
        </>
      )}
    </Stack.Navigator>
  );
}