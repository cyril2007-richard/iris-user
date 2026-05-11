import * as Location from 'expo-location';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import { piApi } from './bridgeEngine';

let locationSubscription: Location.LocationSubscription | null = null;

export async function startLocationForwarder(deviceId: string) {
  if (!deviceId) return;

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    console.error('Permission to access location was denied');
    return;
  }

  // Request background permissions for real deployment
  // await Location.requestBackgroundPermissionsAsync();

  locationSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      distanceInterval: 5, // Update every 5 meters
    },
    async (location) => {
      const { latitude, longitude, accuracy } = location.coords;

      try {
        // 1. Write to Firestore for caregiver map
        const locRef = doc(getFirebaseDb(), 'devices', deviceId, 'location', 'current');
        await setDoc(locRef, {
          lat: latitude,
          lng: longitude,
          accuracy,
          updatedAt: serverTimestamp()
        });

        // 2. Send to Pi
        await piApi.post('/location/update', {
          lat: latitude,
          lng: longitude,
          accuracy
        });
      } catch (error) {
        console.log('Failed to forward location:', error);
      }
    }
  );
}

export function stopLocationForwarder() {
  if (locationSubscription) {
    locationSubscription.remove();
    locationSubscription = null;
  }
}
