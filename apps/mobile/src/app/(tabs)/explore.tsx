import { router } from 'expo-router';

import { prefsStore } from '@/trackmate/prefs';
import { useStore } from '@/lib/store';
import { Button, EmptyState, Screen, Txt } from '@/ui/kit';

// Destination and trek discovery needs a real content source (TrackMate backend,
// later phase). Until then this screen says so instead of showing sample places.
export default function Explore() {
  const { mode } = useStore(prefsStore);
  const trekker = mode === 'TREKKER';
  return (
    <Screen tab>
      <Txt v="title1">Explore</Txt>
      <EmptyState
        icon="travel_explore"
        title="Discovery is coming soon"
        body={trekker
          ? 'Browsing treks and finding co-trekkers will arrive in a later update. You can already plan your own trek.'
          : 'Browsing destinations and finding co-travellers will arrive in a later update. You can already plan your own trip.'}
        action={<Button label={trekker ? 'Plan a trek' : 'Plan a trip'} icon="add" onPress={() => router.push({ pathname: '/journey/new', params: { type: trekker ? 'TREK' : 'TRIP' } })} />}
      />
    </Screen>
  );
}
