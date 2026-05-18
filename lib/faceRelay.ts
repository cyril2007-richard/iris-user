import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import { piApi } from './bridgeEngine';

let unsubFaces: (() => void) | null = null;

export function startFaceRelay(deviceId: string) {
  if (!deviceId) return;

  const facesRef = collection(getFirebaseDb(), 'devices', deviceId, 'faces');
  
  unsubFaces = onSnapshot(facesRef, (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      const face = change.doc.data();
      const faceId = change.doc.id;

      // Handle new or pending faces
      if ((change.type === 'added' || change.type === 'modified') && face.status === 'pending') {
        // Since the Pi is stream-only, we immediately mark as synced for visual feedback in the Caregiver app
        await setDoc(doc(getFirebaseDb(), 'devices', deviceId, 'faces', faceId), {
          status: 'synced'
        }, { merge: true });
      }

      // Handle deleted faces
      if (change.type === 'removed') {
        try {
          await piApi.delete(`/faces/${faceId}`);
        } catch (error) {
          console.error(`Failed to delete face ${faceId} on Pi:`, error);
        }
      }
    });
  });
}

export function stopFaceRelay() {
  if (unsubFaces) unsubFaces();
}
