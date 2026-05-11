import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import { piApi } from './bridgeEngine';
import axios from 'axios';
import { router } from 'expo-router';

let unsubCall: (() => void) | null = null;

const TOKEN_SERVER_URL = process.env.EXPO_PUBLIC_TOKEN_SERVER_URL || 'http://localhost:3000';

// Wrap ALL axios calls to the Pi like this
const safeCallPi = async (endpoint: string, data?: object): Promise<boolean> => {
  try {
    await piApi.post(endpoint, data, { timeout: 3000 });
    return true;
  } catch {
    console.log(`[CallRelay] Pi unreachable at ${endpoint}, skipping`);
    return false;
  }
};

export function startCallRelay(deviceId: string) {
  if (!deviceId) return;

  const callSignalRef = doc(getFirebaseDb(), 'devices', deviceId, 'callSignal', 'status');

  unsubCall = onSnapshot(callSignalRef, async (snapshot) => {
    const signal = snapshot.data();
    if (!signal) return;

    // 1. Handle incoming call from caregiver
    if (signal.status === 'ringing' && signal.initiatedBy === 'caregiver') {
      console.log(`[CallRelay] Incoming call detected for room: ${signal.roomName}`);

      try {
        // 1. Request LiveKit token for the Pi
        const tokenResponse = await axios.post(`${TOKEN_SERVER_URL}/token`, {
          room: signal.roomName,
          name: 'iris-pi'
        });

        const { token } = tokenResponse.data;

        // 2. Attempt to relay join command to Pi (non-blocking)
        if (token) {
          await safeCallPi('/call/join', {
            roomName: signal.roomName,
            token: token
          });
        }

        // 3. Update Firestore status to 'active' so Caregiver knows we've acknowledged
        await setDoc(callSignalRef, {
          status: 'active'
        }, { merge: true });
        
        // 4. Navigate to call screen on the phone
        router.push('/call');
        console.log('[CallRelay] UI navigated to call screen (Phone-to-Phone mode)');

      } catch (error) {
        console.error('[CallRelay] Error handling incoming call:', error);
      }
    }

    // 2. Handle call ended by caregiver
    if (signal.status === 'ended') {
      try {
        console.log('[CallRelay] Call ended signal received');
        await safeCallPi('/call/end');
        
        // Navigate back if on call screen
        router.back();
      } catch (error) {
        console.error('[CallRelay] Error relaying call end to Pi:', error);
      }
    }
  });
}

export function stopCallRelay() {
  if (unsubCall) unsubCall();
}
