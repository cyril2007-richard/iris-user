import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import { router } from 'expo-router';

let unsubCall: (() => void) | null = null;

export function startCallRelay(deviceId: string) {
  if (!deviceId) return;

  const callSignalRef = doc(getFirebaseDb(), 'devices', deviceId, 'callSignal', 'status');

  unsubCall = onSnapshot(callSignalRef, (snapshot) => {
    const signal = snapshot.data();
    if (!signal) return;

    // 1. Handle incoming call from caregiver
    if (signal.status === 'ringing' && signal.initiatedBy === 'caregiver') {
      console.log(`[CallRelay] Incoming call detected from caregiver`);
      
      // Navigate to the call screen. 
      // The call screen itself will decide to use Participant URL because initiatedBy is 'caregiver'
      router.push('/call');
    }

    // 2. Handle call ended (Handled within the call screen's own listener, but safe to have here)
    if (signal.status === 'ended') {
      // If we're not on the call screen, this does nothing. 
      // If we are, the call screen's listener will handle the router.back()
    }
  });
}

export function stopCallRelay() {
  if (unsubCall) unsubCall();
}
