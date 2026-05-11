import React, { useEffect } from 'react';
import '@/global.css';
import { ActionSheetProvider } from '@expo/react-native-action-sheet';
import { ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useColorScheme } from '@/lib/useColorScheme';
import { NAV_THEME } from '@/theme';
import { useAuthStore } from '@/store/useAuthStore';

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  const { colorScheme, isDarkColorScheme } = useColorScheme();
  
  const { user, isInitialized, setInitialized } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();

  // Set initialized on mount to ensure we render the Stack at least once
  useEffect(() => {
    setInitialized(true);
  }, []);

  useEffect(() => {
    // Wait for everything to be ready
    if (!isInitialized || !navigationState?.key) return;

    const inAuthGroup = segments[0] === '(auth)';

    // Defer navigation to the next tick to ensure navigator is fully mounted
    const timeout = setTimeout(() => {
      if (!user && !inAuthGroup) {
        router.replace('/(auth)');
      } else if (user && inAuthGroup) {
        router.replace('/(main)');
      }
    }, 1);

    return () => clearTimeout(timeout);
  }, [user, isInitialized, segments, navigationState?.key]);

  if (!isInitialized) return null;

  return (
    <>
      <StatusBar
        key={`root-status-bar-${isDarkColorScheme ? 'light' : 'dark'}`}
        style={isDarkColorScheme ? 'light' : 'dark'}
      />
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ActionSheetProvider>
          <NavThemeProvider value={NAV_THEME[colorScheme]}>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(main)" />
              <Stack.Screen name="call" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
            </Stack>
          </NavThemeProvider>
        </ActionSheetProvider>
      </GestureHandlerRootView>
    </>
  );
}
