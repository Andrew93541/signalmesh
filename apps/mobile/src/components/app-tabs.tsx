import { NativeTabs } from 'expo-router/native-tabs';

import { C } from '@/components/sm';

export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={C.bg}
      indicatorColor={C.card}
      labelStyle={{ selected: { color: C.text } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>SOS</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="sos.circle" md="sos" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="status">
        <NativeTabs.Trigger.Label>Status</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="list.bullet" md="list" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="relay">
        <NativeTabs.Trigger.Label>Relay</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="antenna.radiowaves.left.and.right" md="cell_tower" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape" md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
