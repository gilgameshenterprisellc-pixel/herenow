import { Linking, Platform } from 'react-native'

// Opens turn-by-turn directions to a venue in the user's native maps app —
// the "concierge" feature (Jacob): an out-of-towner taps a venue and gets
// routed there. From the user's current location to the venue coordinates.
//
// Native-first for the best experience, with a universal web fallback:
//   iOS      -> Apple Maps (maps://), always installed
//   Android  -> Google Maps navigation (google.navigation:)
//   fallback -> https://www.google.com/maps/dir/ which opens the Google Maps
//               app when installed, otherwise the browser (which still offers
//               "open in app"). No native URL-scheme allow-listing required.
//
// A Waze / Apple / Google chooser is an easy follow-up — it needs
// LSApplicationQueriesSchemes entries in app.json so canOpenURL can see those
// third-party schemes.
export async function openDirections(lat: number, lng: number): Promise<void> {
  const dest = `${lat},${lng}`
  const universal = `https://www.google.com/maps/dir/?api=1&destination=${dest}`

  const primary = Platform.select({
    ios: `maps://?daddr=${dest}`,
    android: `google.navigation:q=${dest}`,
    default: universal,
  }) as string

  try {
    const canOpen = await Linking.canOpenURL(primary)
    await Linking.openURL(canOpen ? primary : universal)
  } catch {
    // Last resort: the universal URL is openable on any platform with a browser.
    try {
      await Linking.openURL(universal)
    } catch {
      /* nothing else we can do — silently give up rather than crash the page */
    }
  }
}
