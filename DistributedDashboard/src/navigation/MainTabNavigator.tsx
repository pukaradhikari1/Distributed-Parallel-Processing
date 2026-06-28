// src/navigation/MainTabNavigator.tsx
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import DashboardScreen from '../screens/DashboardScreen';
import WorkloadInputScreen from '../screens/WorkloadInputScreen';
import OutputScreen from '../screens/OutputScreen';
import ErrorLogScreen from '../screens/ErrorLogScreen';
import ProfileScreen from '../screens/ProfileScreen';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

const ICONS: Record<keyof MainTabParamList, string> = {
  Dashboard: 'view-dashboard',
  WorkloadInput: 'tray-arrow-up',
  Output: 'file-document-outline',
  Errors: 'alert-circle-outline',
  Profile: 'account-circle-outline',
};

export default function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
        tabBarIcon: ({ color, size }) => (
          <Icon name={ICONS[route.name as keyof MainTabParamList]} color={color} size={size} />
        ),
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Distributed Parallel Processing' }} />
      <Tab.Screen name="WorkloadInput" component={WorkloadInputScreen} options={{ title: 'Submit' }} />
      <Tab.Screen name="Output" component={OutputScreen} options={{ title: 'Output' }} />
      <Tab.Screen name="Errors" component={ErrorLogScreen} options={{ title: 'Errors' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}