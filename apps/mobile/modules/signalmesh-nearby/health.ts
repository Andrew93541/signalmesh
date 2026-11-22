import { requireOptionalNativeModule } from 'expo';

export type HealthMetric = 'STEPS' | 'DISTANCE' | 'ACTIVE_CALORIES' | 'TOTAL_CALORIES' | 'EXERCISE';
export interface HealthDay {
  date: string; // YYYY-MM-DD local
  steps: number | null; // null = not granted or no data source
  distance_m: number | null;
  active_kcal: number | null;
  total_kcal: number | null;
  exercise_min: number | null;
  sources: string[]; // apps that wrote the data (e.g. com.sec.android.app.shealth)
}
export interface HealthSession { title: string | null; type: number; start: string; end: string; source: string }

interface HealthNative {
  status(): Promise<{ sdk: 'AVAILABLE' | 'UPDATE_REQUIRED' | 'UNAVAILABLE'; granted: HealthMetric[] }>;
  requestPermissions(): Promise<HealthMetric[]>;
  daily(start: string, days: number): Promise<HealthDay[]>;
  sessions(days: number): Promise<HealthSession[]>;
  openSettings(): boolean;
  openAppPermissions(): boolean;
}

/** null in builds without the native module. */
export const Health = requireOptionalNativeModule<HealthNative>('TrackMateHealth');
