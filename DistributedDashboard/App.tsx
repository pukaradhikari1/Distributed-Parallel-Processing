// App.tsx
import React, { useEffect } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DarkTheme as NavDarkTheme, DefaultTheme as NavDefaultTheme } from '@react-navigation/native';
import { PaperProvider, ActivityIndicator } from 'react-native-paper';
import { View } from 'react-native';
import RootNavigator from './src/navigation/RootNavigator';
import { darkTheme, lightTheme } from './src/theme/theme';
import { useAuthStore } from './src/store/useAuthStore';

export default function App() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const paperTheme = isDark ? darkTheme : lightTheme;
  const navTheme = isDark ? NavDarkTheme : NavDefaultTheme;

  const hydrate = useAuthStore(s => s.hydrate);
  const isHydrated = useAuthStore(s => s.isHydrated);

  useEffect(() => {
    hydrate();
  }, []);

  if (!isHydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: paperTheme.colors.background }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={paperTheme}>
          <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
          <NavigationContainer theme={navTheme}>
            <RootNavigator />
          </NavigationContainer>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
