import * as Location from 'expo-location';

/**
 * A location as captured by this phone's location provider. Never invented:
 * when there is no usable fix every coordinate field is null and `unavailableReason` says why.
 */
export interface Fix {
  latitude: number | null;
  longitude: number | null;
  /** Horizontal accuracy radius in metres, as reported by Android. */
  location_accuracy_m: number | null;
  /** When the phone captured this fix (ISO-8601), not when it was sent or received. */
  location_recorded_at: string | null;
  /** DEVICE = fresh fix requested now; DEVICE_LAST_KNOWN = Android's cached fix (may be old). */
  location_source: 'DEVICE' | 'DEVICE_LAST_KNOWN' | null;
  location_is_last_known: boolean | null;
  unavailableReason?: 'PERMISSION_DENIED' | 'LOCATION_OFF' | 'NO_FIX' | 'MOCK_LOCATION';
}

const none = (reason: Fix['unavailableReason']): Fix => ({
  latitude: null, longitude: null, location_accuracy_m: null, location_recorded_at: null,
  location_source: null, location_is_last_known: null, unavailableReason: reason,
});

const FIX_TIMEOUT_MS = 4000;

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

function toFix(pos: Location.LocationObject, lastKnown: boolean): Fix | null {
  // Mock locations (developer options / spoofing apps) are never sent as real GPS.
  if (pos.mocked) return null;
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    location_accuracy_m: pos.coords.accuracy ?? null,
    location_recorded_at: new Date(pos.timestamp).toISOString(),
    location_source: lastKnown ? 'DEVICE_LAST_KNOWN' : 'DEVICE',
    location_is_last_known: lastKnown,
  };
}

/** Best real location within ~4 s. An SOS never waits longer than that for GPS. */
export async function getFix(): Promise<Fix> {
  if (granted === null) await ensureLocationPermission();
  if (!granted) return none('PERMISSION_DENIED');
  try {
    if (!(await Location.hasServicesEnabledAsync())) {
      // Location switched off: Android may still hold an older cached fix.
      const last = await Location.getLastKnownPositionAsync().catch(() => null);
      return (last && toFix(last, true)) || none('LOCATION_OFF');
    }
    const current = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      timeout(FIX_TIMEOUT_MS),
    ]).catch(() => null);
    if (current) {
      const fix = toFix(current, false);
      if (fix) return fix;
      if (current.mocked) return none('MOCK_LOCATION');
    }
    const last = await Location.getLastKnownPositionAsync().catch(() => null);
    if (last?.mocked) return none('MOCK_LOCATION');
    return (last && toFix(last, true)) || none('NO_FIX');
  } catch {
    return none('NO_FIX');
  }
}
