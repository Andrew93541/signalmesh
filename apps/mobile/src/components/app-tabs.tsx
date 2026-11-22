import { NativeTabs } from 'expo-router/native-tabs';

import { color } from '@/ui/theme';

/** Exactly five: Home · Feed · Analytics · Safety · Profile. */
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
      <NativeTabs.Trigger name="feed">
        <NativeTabs.Trigger.Label>Feed</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="photo.on.rectangle" md="dynamic_feed" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="analytics">
        <NativeTabs.Trigger.Label>Analytics</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.bar" md="monitoring" />
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
