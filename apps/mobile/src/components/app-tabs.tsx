import { NativeTabs } from 'expo-router/native-tabs';

import { color } from '@/ui/theme';

export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={color.bg}
      indicatorColor={color.primarySoft}
      labelVisibilityMode="labeled"
      labelStyle={{ default: { color: color.text2 }, selected: { color: color.primary } }}
      iconColor={{ default: color.text2, selected: color.primary }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house" md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Label>Explore</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="safari" md="explore" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="journeys">
        <NativeTabs.Trigger.Label>Journeys</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="map" md="route" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="safety">
        <NativeTabs.Trigger.Label>Safety</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="shield.lefthalf.filled" md="health_and_safety" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.crop.circle" md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
