import { View } from 'react-native';

import { Banner, Screen, Txt } from './kit';
import { color, space } from './theme';

export function LegalDoc({ title, version, sections }: { title: string; version: string; sections: [string, string][] }) {
  return (
    <Screen>
      <Banner tone="warning" icon="info" title="Draft for review"
        body="This text has not been reviewed by a lawyer yet and will change before TrackMate is released." />
      <View style={{ gap: space.xs }}>
        <Txt v="title1">{title}</Txt>
        <Txt v="footnote" c={color.text2}>Version {version}</Txt>
      </View>
      {sections.map(([heading, body]) => (
        <View key={heading} style={{ gap: space.xs }}>
          <Txt v="title2">{heading}</Txt>
          <Txt v="body">{body}</Txt>
        </View>
      ))}
    </Screen>
  );
}
