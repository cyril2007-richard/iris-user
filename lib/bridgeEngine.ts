import axios from 'axios';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import { useDeviceStore } from '@/store/useDeviceStore';

const PI_IP = process.env.EXPO_PUBLIC_PI_LOCAL_IP || '10.105.145.57';
const PI_PORT = process.env.EXPO_PUBLIC_PI_API_PORT || '5000';
const PI_BASE_URL = `http://${PI_IP}:${PI_PORT}`;

export const piApi = axios.create({
  baseURL: PI_BASE_URL,
  timeout: 5000,
});

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let unsubFirestore: (() => void) | null = null;

export function startBridgeEngine(deviceId: string) {
  if (!deviceId) return;

  // Initial update
  useDeviceStore.getState().setDeviceId(deviceId);

  // 1. Setup Heartbeat to Pi (Ping root for connectivity check)
  heartbeatInterval = setInterval(async () => {
    try {
      await piApi.get('/');
      useDeviceStore.getState().setPiReachable(true);
      useDeviceStore.getState().setStatus('online');
      
      // Write basic status to Firestore for Caregiver
      const deviceRef = doc(getFirebaseDb(), 'devices', deviceId);
      await setDoc(deviceRef, {
        status: 'online',
        lastSeen: serverTimestamp(),
        battery: 85, // Mock battery since Pi API doesn't provide it
        moduleHealth: {
          'Obstacle Detection': 'Active',
          'Navigation': 'Active',
          'Face Recognition': 'Active',
          'Voice Interaction': 'Active'
        },
      }, { merge: true });

    } catch (error) {
      console.log('Pi unreachable (Root Ping Failed):', error.message);
      useDeviceStore.getState().setPiReachable(false);
      useDeviceStore.getState().setStatus('offline');
      
      const deviceRef = doc(getFirebaseDb(), 'devices', deviceId);
      await setDoc(deviceRef, {
        status: 'offline',
        lastSeen: serverTimestamp()
      }, { merge: true }).catch(() => {});
    }
  }, 15000); // Check every 15s for better responsiveness

  // 2. Listen to Firestore for relay commands (e.g. alerts, calls)
  const deviceRef = doc(getFirebaseDb(), 'devices', deviceId);
  unsubFirestore = onSnapshot(deviceRef, (snapshot) => {
    const data = snapshot.data();
    if (!data) return;

    // TODO: Detect specific changes like callSignal or alerts and relay to Pi via piApi
  });
}

export function stopBridgeEngine() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  if (unsubFirestore) unsubFirestore();
}
