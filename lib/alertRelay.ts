import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import { piApi } from './bridgeEngine';

let unsubAlerts: (() => void) | null = null;

export function startAlertRelay(deviceId: string) {
  if (!deviceId) return;

  const alertsRef = collection(getFirebaseDb(), 'devices', deviceId, 'alerts');
  // Listen for the most recent alert triggered by the caregiver
  const q = query(alertsRef, where('triggeredBy', '==', 'caregiver'), orderBy('triggeredAt', 'desc'), limit(1));
  
  unsubAlerts = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      // We only care about newly added alerts in real-time
      if (change.type === 'added') {
        const alert = change.doc.data();
        
        try {
          await piApi.post('/alert/announce', {
            message: alert.message || "Your caregiver has sent an emergency alert. Help is being contacted."
          });
        } catch (error) {
          console.error("Failed to relay alert to Pi:", error);
        }
      }
    });
  });
}

export function stopAlertRelay() {
  if (unsubAlerts) unsubAlerts();
}
