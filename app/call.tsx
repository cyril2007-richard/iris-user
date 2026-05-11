import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import axios from 'axios';
import { doc, setDoc, serverTimestamp, onSnapshot, getDoc } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { useDeviceStore } from '@/store/useDeviceStore';
import { Text } from '@/components/nativewindui/Text';
import { Button } from '@/components/nativewindui/Button';

// WHEREBY LINKS
const HOST_URL = 'https://vhorde.whereby.com/irisb5644895-e4d5-462f-83f6-650b3fd77683?roomKey=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJtZWV0aW5nSWQiOiIxMjk2ODI0NDEiLCJyb29tUmVmZXJlbmNlIjp7InJvb21OYW1lIjoiL2lyaXNiNTY0NDg5NS1lNGQ1LTQ2MmYtODNmNi02NTBiM2ZkNzc2ODMiLCJvcmdhbml6YXRpb25JZCI6IjM0MDE4MCJ9LCJpc3MiOiJodHRwczovL2FjY291bnRzLnNydi53aGVyZWJ5LmNvbSIsImlhdCI6MTc3ODQ4NzQzNCwicm9vbUtleVR5cGUiOiJtZWV0aW5nSG9zdCJ9.J9SfEyyJAhM1YqxR4f06HiprcNl7TPpQvEconYipcpw';
const PARTICIPANT_URL = 'https://vhorde.whereby.com/irisb5644895-e4d5-462f-83f6-650b3fd77683';

const PI_API_URL = 'http://192.168.43.100:8000';

export default function UserCallScreen() {
  const router = useRouter();
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [permissionsReady, setPermissionsReady] = useState(false);
  const deviceId = useDeviceStore.getState().deviceId || 'demo-device-id';
  const urlSetRef = useRef(false);

  // Helper for safe exit
  const safeExit = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(main)');
    }
  };

  useEffect(() => {
    let isMounted = true;
    let unsub: (() => void) | null = null;

    const startSession = async () => {
      // 1. Permissions
      if (Platform.OS === 'android') {
        try {
          const granted = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.CAMERA,
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          ]);
          if (
            granted['android.permission.CAMERA'] !== PermissionsAndroid.RESULTS.GRANTED ||
            granted['android.permission.RECORD_AUDIO'] !== PermissionsAndroid.RESULTS.GRANTED
          ) {
            Alert.alert('Permissions Required', 'Camera and Mic are needed.');
            safeExit();
            return;
          }
        } catch (err) {
          console.error('Permission error:', err);
          return;
        }
      }
      
      if (isMounted) setPermissionsReady(true);

      // 2. Setup Logic
      const callSignalRef = doc(getFirebaseDb(), 'devices', deviceId, 'callSignal', 'status');
      
      const initialSnap = await getDoc(callSignalRef);
      const initialData = initialSnap.data();

      if (isMounted && !urlSetRef.current) {
        // Only start a call if it's not already active or ringing from the other side
        const isInitiator = !initialData || initialData.status === 'ended';
        
        if (isInitiator) {
          setCurrentUrl(HOST_URL);
          urlSetRef.current = true;
          await setDoc(callSignalRef, {
            initiatedBy: 'user',
            status: 'ringing',
            timestamp: serverTimestamp(),
          });
        } else {
          setCurrentUrl(PARTICIPANT_URL);
          urlSetRef.current = true;
          // Mark as active to acknowledge the incoming call
          await setDoc(callSignalRef, { status: 'active' }, { merge: true });
        }

        // Always signal Pi
        axios.post(`${PI_API_URL}/call/join`, { url: PARTICIPANT_URL }).catch(() => {
          console.log('Pi unreachable, phone camera fallback active');
        });
      }

      unsub = onSnapshot(callSignalRef, (snapshot) => {
        const data = snapshot.data();
        // Only trigger exit if status changes to 'ended' while we are on screen
        if (data?.status === 'ended' && isMounted) {
          safeExit();
        }
      });
    };

    startSession();

    return () => {
      isMounted = false;
      if (unsub) unsub();
    };
  }, [deviceId]);

  const endCall = async () => {
    try {
      const callSignalRef = doc(getFirebaseDb(), 'devices', deviceId, 'callSignal', 'status');
      await setDoc(callSignalRef, { status: 'ended' }, { merge: true });
    } catch (e) {
      console.error('End call error:', e);
    }
    safeExit();
  };

  if (!permissionsReady || !currentUrl) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1A6BFF" />
        <Text style={styles.loadingText}>Connecting...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        source={{ uri: `${currentUrl}${currentUrl.includes('?') ? '&' : '?'}embed&skipMediaPermissionPrompt&audio=on&video=on` }}
        style={styles.webView}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback={true}
        originWhitelist={['*']}
        androidLayerType="hardware"
        onPermissionRequest={(request: { grant: (resources: string[]) => void; resources: string[] }) => {
        request.grant(request.resources);
        }}
      />
      
      <View style={styles.controls}>
        <Button onPress={endCall} variant="tonal" className="bg-red-600 h-16 rounded-full w-2/3 shadow-lg">
          <Text className="text-white font-bold text-lg">END CALL</Text>
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  webView: { flex: 1 },
  loadingText: { color: '#fff', marginTop: 16, textAlign: 'center' },
  controls: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
});
