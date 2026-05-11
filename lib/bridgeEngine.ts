import axios from 'axios';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import { useDeviceStore } from '@/store/useDeviceStore';

const PI_IP = process.env.EXPO_PUBLIC_PI_LOCAL_IP || '192.168.43.100';
const PI_PORT = process.env.EXPO_PUBLIC_PI_API_PORT || '8000';
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

  // 1. Setup Heartbeat to Pi
  heartbeatInterval = setInterval(async () => {
    try {
      const response = await piApi.get('/status');
      useDeviceStore.getState().setPiReachable(true);
      useDeviceStore.getState().setStatus('online');
      
      // Write Pi status to Firestore
      const deviceRef = doc(getFirebaseDb(), 'devices', deviceId);
      await setDoc(deviceRef, {
        status: 'online',
        lastSeen: serverTimestamp(),
        battery: response.data.battery || 100,
        moduleHealth: response.data.modules || {},
      }, { merge: true });

    } catch (error) {
      console.log('Pi unreachable:', error);
      useDeviceStore.getState().setPiReachable(false);
      useDeviceStore.getState().setStatus('offline');
      
      // Update Firestore to offline if ping fails
      const deviceRef = doc(getFirebaseDb(), 'devices', deviceId);
      await setDoc(deviceRef, {
        status: 'offline',
        lastSeen: serverTimestamp()
      }, { merge: true }).catch(console.error);
    }
  }, 30000); // Every 30s

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
