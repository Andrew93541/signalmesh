// The supplied TrekMate logo, shown exactly as provided: square, never cropped,
// stretched or tinted. Size is the only thing callers can change.
//
// Note: the logo artwork reads "TrekMate" while the product name in code is
// "TrackMate". Pending confirmation, see docs/IMPLEMENTATION_STATUS.md.

import { Image } from 'react-native';

const SOURCE = require('../../assets/brand/trekmate-logo.webp');

export function Logo({ size = 160 }: { size?: number }) {
  return (
    <Image
      source={SOURCE}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="TrekMate logo"
    />
  );
}
