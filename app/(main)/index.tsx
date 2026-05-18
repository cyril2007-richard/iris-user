import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { View, Alert } from 'react-native';
import { WebView } from 'react-native-webview';

import { Button } from '@/components/nativewindui/Button';
import { Text } from '@/components/nativewindui/Text';
import { startAlertRelay, stopAlertRelay } from '@/lib/alertRelay';
import { startBridgeEngine, stopBridgeEngine } from '@/lib/bridgeEngine';
import { startCallRelay, stopCallRelay } from '@/lib/callRelay';
import { startFaceRelay, stopFaceRelay } from '@/lib/faceRelay';
import { startLocationForwarder, stopLocationForwarder } from '@/lib/locationForwarder';
import { useAuthStore } from '@/store/useAuthStore';
import { useDeviceStore } from '@/store/useDeviceStore';

const PI_STREAM_URL = 'http://10.105.145.57:5000/stream.mjpg';

export default function HomeScreen() {
  const status = useDeviceStore((s) => s.status);
  const { setUser } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    const deviceId = 'iris-device-001';

    startBridgeEngine(deviceId);
    startCallRelay(deviceId);
    startFaceRelay(deviceId);
    startAlertRelay(deviceId);
    startLocationForwarder(deviceId);

    return () => {
      stopBridgeEngine();
      stopCallRelay();
      stopFaceRelay();
      stopAlertRelay();
      stopLocationForwarder();
    };
  }, []);

  const startCall = async () => {
    router.push('/call');
  };

  const triggerEmergency = async () => {
    Alert.alert('Emergency', 'Are you sure you want to send an emergency alert?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send Alert',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            'SOS Sent',
            'Your emergency signal has been transmitted to your caregiver and the local response system.'
          );
        },
      },
    ]);
  };

  const logout = () => {
    setUser(null);
  };

  return (
    <View className="flex-1 bg-white p-6 pt-16">
      <View className="mb-10 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-blue-600">
            <MaterialCommunityIcons name="eye" size={24} color="white" />
          </View>
          <Text variant="title1" className="font-black tracking-tighter text-blue-600">
            IRIS
          </Text>
        </View>
        <Button variant="plain" onPress={logout} className="p-0">
          <Text className="font-bold text-gray-400">Logout</Text>
        </Button>
      </View>

      <View
        className={`mb-6 flex-row items-center justify-center rounded-3xl border-4 ${status === 'online' ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-gray-50'} py-6 shadow-xl shadow-black/10`}>
        <View className="items-center">
          <View className="flex-row items-center">
            <MaterialCommunityIcons
              name={status === 'online' ? 'check-circle' : 'close-circle'}
              size={32}
              color={status === 'online' ? '#22c55e' : '#9ca3af'}
            />
            <Text
              className={`ml-3 text-2xl font-black ${status === 'online' ? 'text-green-700' : 'text-gray-600'}`}>
              {status === 'online' ? 'SYSTEM ONLINE' : 'SYSTEM OFFLINE'}
            </Text>
          </View>
          {status === 'online' && (
            <View className="mt-2 flex-row items-center rounded-full bg-blue-100 px-3 py-1">
              <MaterialCommunityIcons name="crosshairs-gps" size={14} color="#2563eb" />
              <Text className="ml-1 text-[10px] font-black uppercase text-blue-700">GPS Active & Forwarding</Text>
            </View>
          )}
        </View>
      </View>

      <Button
        onPress={startCall}
        className="mb-6 h-32 w-full flex-col items-center justify-center rounded-3xl bg-blue-600 shadow-2xl shadow-blue-600/40 active:scale-95">
        <MaterialCommunityIcons name="phone-outgoing" size={40} color="white" />
        <Text className="mt-2 text-xl font-black uppercase tracking-widest text-white">
          Call Caregiver
        </Text>
      </Button>

      <View className="mb-6 h-48 w-full overflow-hidden rounded-3xl border-4 border-gray-100 bg-black shadow-xl shadow-black/5">
        <View className="absolute left-4 top-4 z-10 flex-row items-center rounded-full bg-black/60 px-3 py-1 backdrop-blur-md">
          <View
            className={`mr-2 h-2 w-2 rounded-full ${status === 'online' ? 'bg-green-500' : 'bg-red-500'}`}
          />
          <Text className="text-[10px] font-black uppercase text-white">Local Pi Feed</Text>
        </View>
        <WebView
          source={{
            html: `
            <html>
              <body style="margin:0;padding:0;background-color:black;display:flex;justify-content:center;align-items:center;">
                <img src="${PI_STREAM_URL}" style="width:100%;height:100%;object-fit:contain;" />
              </body>
            </html>
          `,
          }}
          style={{ flex: 1, backgroundColor: 'black' }}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          originWhitelist={['*']}
        />
      </View>

      <View className="mt-auto">
        <Button
          onPress={triggerEmergency}
          className="h-20 w-full flex-row items-center justify-center rounded-3xl bg-red-600 shadow-2xl shadow-red-600/40 active:scale-95">
          <MaterialCommunityIcons name="alert-circle" size={32} color="white" />
          <Text className="ml-3 text-xl font-black uppercase tracking-tight text-white">
            Emergency SOS
          </Text>
        </Button>
      </View>
    </View>
  );
}
