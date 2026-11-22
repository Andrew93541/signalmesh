import { requireOptionalNativeModule, type EventSubscription } from 'expo';

export interface Peer { endpointId: string; name: string }

export interface AlertStatus {
  notificationsEnabled: boolean;
  channelEnabled: boolean;
  canFullScreen: boolean;
  dndActive: boolean;
  alertsEnabled: boolean;
  volume: number;
  vibrate: boolean;
  sound: boolean;
  notify: boolean;
  sirenPlaying: boolean;
}

type Events = {
  onPeer: (e: { type: 'connected' | 'disconnected'; endpointId: string; name: string | null }) => void;
  onMessage: (e: { endpointId: string; name: string | null; data: string }) => void;
  onLog: (e: { message: string }) => void;
  /** A new SOS reached THIS phone (deduplicated by incident ID in native code). */
  onAlert: (e: { messageId: string; notified: boolean }) => void;
  /** The recipient acknowledged (from the notification or the app). */
  onAck: (e: { messageId: string; ackState: string }) => void;
};

interface NearbyNative {
  start(name: string): Promise<boolean>;
  stop(): Promise<boolean>;
  send(endpointId: string, data: string): Promise<boolean>;
  peers(): Peer[];
  // Recipient alerts (JSON strings are SosAlerts records)
  alertStatus(): AlertStatus;
  setAlertPrefs(enabled: boolean, volume: number, vibrate: boolean, sound: boolean, notify: boolean): boolean;
  handleIncomingSos(json: string, source: string): boolean;
  getAlert(id: string): string | null;
  listAlerts(): string[];
  acknowledge(id: string): string | null;
  markAckConfirmed(id: string, via: string): string | null;
  pendingAcks(): string[];
  resolveAlert(id: string, status: string): string | null;
  testSiren(): boolean;
  stopSiren(): boolean;
  consumeLaunchAlert(): string | null;
  releaseLockScreen(): boolean;
  openNotificationSettings(): boolean;
  openFullScreenSettings(): boolean;
  startService(): boolean;
  stopService(): boolean;
  addListener<K extends keyof Events>(event: K, listener: Events[K]): EventSubscription;
}

/** null in Expo Go / web / builds made before this module existed. */
export const Nearby = requireOptionalNativeModule<NearbyNative>('SignalMeshNearby');
