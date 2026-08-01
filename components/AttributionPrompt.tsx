import { useEffect, useState } from 'react'
import {
  View, Text, Modal, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'

interface Props { visible: boolean; onDone: () => void }
interface V { id: string; name: string }

// One-time "which venue brought you?" prompt shown at first launch. Apple/Google
// don't hand us install attribution, so this is how we connect a signup back to
// the venue (and its printed QR) that drove it — the core of Jacob's pilot
// question. Optional and shown once; answering or skipping sets attribution_done.
export default function AttributionPrompt({ visible, onDone }: Props) {
  const insets = useSafeAreaInsets()
  const [venues, setVenues] = useState<V[]>([])
  const [q, setQ]           = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!visible || loaded) return
    supabase.from('zones').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => { setVenues((data as V[]) ?? []); setLoaded(true) })
  }, [visible, loaded])

  const save = async (zoneId: string | null) => {
    if (saving) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('profiles')
        .update({ signup_zone_id: zoneId, attribution_done: true })
        .eq('id', user.id)
    }
    setSaving(false)
    onDone()
  }

  const filtered = venues.filter((v) => v.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={[styles.container, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 14 }]}>
        <Text style={styles.title}>Which venue brought you to HereNow?</Text>
        <Text style={styles.sub}>Helps us know which spots are spreading the word. Totally optional.</Text>

        <TextInput
          style={styles.search}
          placeholder="Search venues…"
          placeholderTextColor="#5b7089"
          value={q}
          onChangeText={setQ}
        />

        {!loaded ? (
          <ActivityIndicator color="#29B6F6" style={{ marginTop: 24 }} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(v) => v.id}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.row} onPress={() => save(item.id)} disabled={saving} activeOpacity={0.7}>
                <Text style={styles.rowText}>{item.name}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.empty}>No venues match.</Text>}
          />
        )}

        <TouchableOpacity style={styles.skip} onPress={() => save(null)} disabled={saving} activeOpacity={0.7}>
          <Text style={styles.skipText}>{saving ? 'Saving…' : 'I found it myself'}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15', paddingHorizontal: 20 },
  title: { color: '#f8fafc', fontSize: 24, fontWeight: '800', lineHeight: 30 },
  sub: { color: '#7A93AC', fontSize: 14, marginTop: 8, lineHeight: 20 },
  search: { backgroundColor: '#0D1B2E', borderColor: '#1A2E4A', borderWidth: 1, borderRadius: 12, padding: 13, color: '#f8fafc', fontSize: 15, marginTop: 18 },
  list: { flex: 1, marginTop: 8 },
  row: { paddingVertical: 15, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: '#0D1B2E' },
  rowText: { color: '#f8fafc', fontSize: 16, fontWeight: '600' },
  empty: { color: '#7A93AC', fontSize: 14, textAlign: 'center', marginTop: 24 },
  skip: { paddingVertical: 15, alignItems: 'center', marginTop: 6 },
  skipText: { color: '#29B6F6', fontSize: 15, fontWeight: '700' },
})
