import { requireOptionalNativeModule, type EventSubscription } from 'expo';

export interface Peer { endpointId: string; name: string }
type Events = {
  onPeer: (e: { type: 'connected' | 'disconnected'; endpointId: string; name: string | null }) => void;
  onMessage: (e: { endpointId: string; name: string | null; data: string }) => void;
  onLog: (e: { message: string }) => void;
};
interface NearbyNative {
  start(name: string): Promise<boolean>;
  stop(): Promise<boolean>;
  send(endpointId: string, data: string): Promise<boolean>;
  peers(): Peer[];
  addListener<K extends keyof Events>(event: K, listener: Events[K]): EventSubscription;
}

/** null in Expo Go / web / builds made before this module existed. */
export const Nearby = requireOptionalNativeModule<NearbyNative>('SignalMeshNearby');
