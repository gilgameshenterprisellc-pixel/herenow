import { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import BackButton from '@/components/BackButton'
import AnnouncementsPanel from '@/components/venue/AnnouncementsPanel'
import PromotionsPanel from '@/components/venue/PromotionsPanel'
import { UI } from '@/lib/appIcons'

type Kind = 'announcement' | 'promotion'

// One place for a venue to talk to its people (Jacob, Oct 29): the old Announce
// and Promotions tiles merged into Broadcast. Each kind keeps everything it
// already did; the venue just picks which one it's sending.
export default function VenueBroadcastScreen() {
  const insets = useSafeAreaInsets()
  const { type } = useLocalSearchParams<{ type?: string }>()
  const [kind, setKind] = useState<Kind>(type === 'promotion' ? 'promotion' : 'announcement')

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/venue/dashboard' as any)} />
        <Text style={styles.title}>Broadcast</Text>
      </View>

      <View style={[styles.switchWrap, webCenter]}>
        <TouchableOpacity
          style={[styles.switchBtn, kind === 'announcement' && styles.switchBtnOn]}
          onPress={() => setKind('announcement')}
          accessibilityRole="button"
          accessibilityState={{ selected: kind === 'announcement' }}
        >
          <Ionicons name={UI.announce} size={16} color={kind === 'announcement' ? '#29B6F6' : '#7A93AC'} />
          <Text style={[styles.switchText, kind === 'announcement' && styles.switchTextOn]}>Announcement</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.switchBtn, kind === 'promotion' && styles.switchBtnOn]}
          onPress={() => setKind('promotion')}
          accessibilityRole="button"
          accessibilityState={{ selected: kind === 'promotion' }}
        >
          <Ionicons name={UI.promotions} size={16} color={kind === 'promotion' ? '#29B6F6' : '#7A93AC'} />
          <Text style={[styles.switchText, kind === 'promotion' && styles.switchTextOn]}>Promotion</Text>
        </TouchableOpacity>
      </View>

      {/* Both stay mounted so switching kinds never throws away a half-written draft. */}
      <View style={[styles.flex, kind !== 'announcement' && styles.hidden]}>
        <AnnouncementsPanel />
      </View>
      <View style={[styles.flex, kind !== 'promotion' && styles.hidden]}>
        <PromotionsPanel />
      </View>
    </View>
  )
}

const webCenter = Platform.select({
  web: { maxWidth: 600, alignSelf: 'center' as const, width: '100%' as any } as any,
  default: {},
})

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  flex:      { flex: 1 },
  hidden:    { display: 'none' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#0D1B2E',
  },
  title: { fontSize: 18, fontWeight: '800', color: '#f8fafc', flex: 1 },
  switchWrap: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingTop: 14,
  },
  switchBtn: {
    flex: 1, minHeight: 44, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: '#1A2E4A', backgroundColor: '#07101F',
  },
  switchBtnOn:  { borderColor: '#29B6F6', backgroundColor: '#29B6F620' },
  switchText:   { fontSize: 14, fontWeight: '700', color: '#7A93AC' },
  switchTextOn: { color: '#29B6F6' },
})
