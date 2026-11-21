import * as Location from 'expo-location';

export interface Fix {
  latitude: number | null;
  longitude: number | null;
}

const NO_FIX: Fix = { latitude: null, longitude: null };
const FIX_TIMEOUT_MS = 3000;

let granted: boolean | null = null;

export async function ensureLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    granted = status === 'granted';
  } catch {
    granted = false;
  }
  return granted;
}

function timeout(ms: number) {
  return new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));
}

/** Best location we can get within ~3 s. An SOS never waits longer than that for GPS. */
export async function getFix(): Promise<Fix> {
  if (granted === null) await ensureLocationPermission();
  if (!granted) return NO_FIX;
  try {
    const current = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      timeout(FIX_TIMEOUT_MS),
    ]);
    const pos = current ?? (await Location.getLastKnownPositionAsync());
    return pos ? { latitude: pos.coords.latitude, longitude: pos.coords.longitude } : NO_FIX;
  } catch {
    return NO_FIX;
  }
}
