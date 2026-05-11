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
        try {
          // 1. Download image from Firebase Storage URL
          const response = await fetch(face.imageUrl);
          const blob = await response.blob();
          
          // 2. Convert to Base64
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = async () => {
            const base64data = (reader.result as string).split(',')[1];
            
            // 3. Send to Pi
            try {
              const piResponse = await piApi.post('/faces/add', {
                faceId: faceId,
                name: face.name,
                imageData: base64data,
              });

              // 4. Update Firestore on success
              if (piResponse.data && piResponse.data.success) {
                await setDoc(doc(getFirebaseDb(), 'devices', deviceId, 'faces', faceId), {
                  status: 'synced'
                }, { merge: true });
              } else {
                throw new Error('Pi rejected the face image');
              }
            } catch (err) {
              console.log('[FaceRelay] Pi unreachable during add, marking as failed');
              await setDoc(doc(getFirebaseDb(), 'devices', deviceId, 'faces', faceId), {
                status: 'failed'
              }, { merge: true });
            }
          };

        } catch (error) {
          console.error(`Failed to relay face ${faceId}:`, error);
          await setDoc(doc(getFirebaseDb(), 'devices', deviceId, 'faces', faceId), {
            status: 'failed'
          }, { merge: true });
        }
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
