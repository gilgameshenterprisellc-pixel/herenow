import { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'

interface PrivacySettings {
  show_social_mode: boolean
  show_mood: boolean
  show_interests: boolean
  show_kickoff: boolean
}

const DEFAULTS: PrivacySettings = {
  show_social_mode: true,
  show_mood: true,
  show_interests: true,
  show_kickoff: true,
}

export default function ProfilePrivacyScreen() {
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [userId, setUserId]     = useState<string | null>(null)
  const [priv, setPriv]         = useState<PrivacySettings>(DEFAULTS)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace('/(auth)/login'); return }
      setUserId(user.id)
      const { data } = await supabase
        .from('profiles')
        .select('privacy_settings')
        .eq('id', user.id)
        .maybeSingle()
      if (data?.privacy_settings) setPriv({ ...DEFAULTS, ...data.privacy_settings })
      setLoading(false)
    })
  }, [])

  const update = async (key: keyof PrivacySettings, val: boolean) => {
    const next = { ...priv, [key]: val }
    setPriv(next)
    if (!userId) return
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ privacy_settings: next })
      .eq('id', userId)
    setSaving(false)
    if (error) {
      showToast('Could not save. Try again.', 'error')
      setPriv(priv)
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#29B6F6" size="large" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')}
          style={styles.backBtn}
        >
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Card Visibility</Text>
        {saving && <ActivityIndicator color="#29B6F6" size="small" style={{ marginRight: 4 }} />}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <Text style={styles.introTitle}>What others see on your card</Text>
          <Text style={styles.introSub}>
            Your name and avatar are always shown. Toggle anything else off to keep it private while you're checked in.
          </Text>
        </View>

        <View style={styles.card}>
          <PrivRow
            label="Social Mode"
            sub='Dating / Friends / Networking / Just Vibes badge'
            value={priv.show_social_mode}
            onChange={(v) => update('show_social_mode', v)}
          />
          <View style={styles.divider} />
          <PrivRow
            label="Mood"
            sub='Open / Selective / Not Today badge'
            value={priv.show_mood}
            onChange={(v) => update('show_mood', v)}
          />
          <View style={styles.divider} />
          <PrivRow
            label="Interests"
            sub='Your interest tags (up to 3 shown)'
            value={priv.show_interests}
            onChange={(v) => update('show_interests', v)}
          />
          <View style={styles.divider} />
          <PrivRow
            label="Conversation Starter"
            sub='"Ask them:" prompt shown below your card'
            value={priv.show_kickoff}
            onChange={(v) => update('show_kickoff', v)}
          />
        </View>

        <View style={styles.note}>
          <Text style={styles.noteText}>
            Changes apply immediately. Venue owners never see your profile — only checked-in guests at the same venue do.
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

function PrivRow({
  label, sub, value, onChange,
}: { label: string; sub: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#1A2E4A', true: '#29B6F6' }}
        thumbColor="#f8fafc"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  center:    { flex: 1, backgroundColor: '#050A15', alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#0D1B2E',
  },
  backBtn:  { padding: 8 },
  backText: { fontSize: 22, color: '#f8fafc' },
  title:    { fontSize: 18, fontWeight: '800', color: '#f8fafc', flex: 1 },
  scroll:   { flex: 1 },
  content:  { padding: 16, gap: 20, paddingBottom: 48 },
  intro: { gap: 6 },
  introTitle: { fontSize: 16, fontWeight: '800', color: '#f8fafc' },
  introSub:   { fontSize: 13, color: '#5A7A9A', lineHeight: 18 },
  card: {
    backgroundColor: '#0D1B2E', borderRadius: 14,
    borderWidth: 1, borderColor: '#1A2E4A', overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 16,
  },
  rowLabel: { fontSize: 15, color: '#f8fafc', fontWeight: '500' },
  rowSub:   { fontSize: 12, color: '#5A7A9A', marginTop: 2, lineHeight: 16 },
  divider:  { height: 1, backgroundColor: '#1A2E4A', marginLeft: 16 },
  note: {
    backgroundColor: '#0D1B2E', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  noteText: { fontSize: 12, color: '#4A6580', lineHeight: 17, textAlign: 'center' },
})
