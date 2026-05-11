import React from 'react';
import { View } from 'react-native';

import { Button } from '@/components/nativewindui/Button';
import { Text } from '@/components/nativewindui/Text';
import { useAuthStore } from '@/store/useAuthStore';

export default function SetupScreen() {
  const { setUser } = useAuthStore();

  const handleLogin = () => {
    console.log('[Prototype] Entering User Application...');
    // Prototype Setup: Mock user setup
    setUser({
      uid: 'mock-user-id',
      email: 'prototype@iris.com',
      displayName: 'Prototype User',
    });
  };

  return (
    <View className="flex-1 items-center justify-center bg-white p-6">
      <Text variant="title1" className="mb-2 font-bold text-primary">Iris Setup</Text>
      <Text variant="body" className="mb-10 text-center text-textSecondary">
        Prototype Mode: Tap below to start the application.
      </Text>
      <Button onPress={handleLogin} className="flex h-14 w-full items-center justify-center rounded-xl bg-primary">
        <Text className="font-semibold text-white">Start Prototype</Text>
      </Button>
    </View>
  );
}
