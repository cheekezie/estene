import { Linking } from 'react-native';
import type { GeoPoint } from '@estene/contracts/common';

export type Place = {
  location?: GeoPoint | null;
  /** Free-text fallback when there are no coordinates. */
  text: string;
};

/**
 * Google Maps directions from wherever the rider is. The https link opens the
 * Google Maps app when installed (both platforms), else the browser.
 */
export function directionsUrl(place: Place) {
  const destination = place.location
    ? `${place.location.lat},${place.location.lng}`
    : encodeURIComponent(place.text);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
}

export const navigateTo = (place: Place) => Linking.openURL(directionsUrl(place));

export const call = (phone: string) => Linking.openURL(`tel:${phone}`);
