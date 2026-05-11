import React, { useEffect } from 'react';
import { View, Alert } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/nativewindui/Button';
import { Text } from '@/components/nativewindui/Text';
import { useDeviceStore } from '@/store/useDeviceStore';
import { useAuthStore } from '@/store/useAuthStore';
import { startBridgeEngine, stopBridgeEngine } from '@/lib/bridgeEngine';
import { startCallRelay, stopCallRelay } from '@/lib/callRelay';

export default function HomeScreen() {
  const status = useDeviceStore((s) => s.status);
  const setStatus = useDeviceStore((s) => s.setStatus);
  const { setUser } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    // Mock initialization for prototype
    console.log('[Prototype] HomeScreen Initialized');
    const deviceId = 'demo-device-id';
    
    startBridgeEngine(deviceId);
    startCallRelay(deviceId);

    return () => {
      stopBridgeEngine();
      stopCallRelay();
    };
  }, []);

  const startCall = async () => {
    // Prototype Mock: Navigate to call screen directly
    router.push('/call');
  };

  const triggerEmergency = async () => {
    Alert.alert("Emergency", "Are you sure you want to send an emergency alert?", [
      { text: "Cancel", style: "cancel" },
      { text: "Send Alert", style: "destructive", onPress: () => {
        Alert.alert("Prototype", "Emergency alert signal simulated. In a live app, this would notify the caregiver and Pi.");
      }}
    ]);
  };

  const logout = () => {
    setUser(null);
  };

  return (
    <View className="flex-1 bg-white p-6 pt-16">
      <View className="mb-8 flex-row items-center justify-between">
        <Text variant="title1" className="font-bold">
          IRIS
        </Text>
        <Button variant="plain" onPress={logout}>
          <Text className="text-primary">Logout</Text>
        </Button>
      </View>

      <View
        className={`mb-6 rounded-xl border ${status === 'online' ? 'border-primary' : 'border-gray-200'} bg-primaryLight/10 p-4`}>
        <Text className="text-center text-lg font-semibold">
          {status === 'online' ? '🟢 Online · Battery 74%' : '⚫ Offline'}
        </Text>
      </View>

      <Button onPress={startCall} size="lg" className="mb-6 h-24 w-full justify-center rounded-xl bg-primary">
        <Text variant="title3" className="text-center font-bold text-white">
          CALL CAREGIVER
        </Text>
      </Button>

      <View className="mt-auto">
        <Button
          onPress={triggerEmergency}
          variant="tonal"
          className="h-14 w-full justify-center rounded-xl bg-danger mb-4">
          <Text className="font-bold text-white">⚠ EMERGENCY ALERT</Text>
        </Button>
      </View>
    </View>
  );
}
