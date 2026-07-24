import { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, Alert, Platform, Linking,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import BackButton from '@/components/BackButton'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

// On web, Linking.openURL('mailto:…') opens a blank browser tab. Navigating the
// current tab hands the mailto straight to the OS mail handler with no blank tab.
function openMail(url: string) {
  if (Platform.OS === 'web') { window.location.href = url }
  else { Linking.openURL(url) }
}

function SettingsRow({
  icon, label, subtitle, onPress, value, onValueChange, destructive = false,
}: {
  icon: IoniconsName
  label: string
  subtitle?: string
  onPress?: () => void
  value?: boolean
  onValueChange?: (v: boolean) => void
  destructive?: boolean
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={!onPress && value === undefined}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <Ionicons name={icon} size={20} color={destructive ? '#ef4444' : '#5A7A9A'} style={styles.rowIcon} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, destructive && styles.rowLabelRed]}>{label}</Text>
        {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      {value !== undefined && onValueChange ? (
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: '#1A2E4A', true: '#29B6F6' }}
          thumbColor="#f8fafc"
        />
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={18} color="#2A3F55" />
      ) : null}
    </TouchableOpacity>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  )
}

const DEFAULT_NOTIF_PREFS = {
  venue_announcement: true,
  wemet_confirmed:    true,
  message:            true,
  dm_expiry:          true,
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets()
  const [ghostMode, setGhostMode]       = useState(false)
  const [userId, setUserId]             = useState<string | null>(null)
  const [notifPrefs, setNotifPrefs]     = useState(DEFAULT_NOTIF_PREFS)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      supabase.from('profiles').select('ghost_mode, notification_prefs').eq('id', user.id).maybeSingle()
        .then(({ data }) => {
          setGhostMode(data?.ghost_mode === true)
          if (data?.notification_prefs) {
            setNotifPrefs({ ...DEFAULT_NOTIF_PREFS, ...(data.notification_prefs as typeof DEFAULT_NOTIF_PREFS) })
          }
        })
    })
  }, [])

  const toggleGhostMode = async (val: boolean) => {
    setGhostMode(val)
    if (!userId) return
    // Ghost is its own flag now (separate from Mood). Save the default and flip
    // the active session too, so it takes effect immediately if checked in.
    await supabase.from('profiles').update({ ghost_mode: val }).eq('id', userId)
    await supabase.from('sessions').update({ is_ghost: val }).eq('user_id', userId).eq('is_active', true)
  }

  const updateNotifPref = async (key: keyof typeof DEFAULT_NOTIF_PREFS, val: boolean) => {
    const next = { ...notifPrefs, [key]: val }
    setNotifPrefs(next)
    if (!userId) return
    await supabase.from('profiles')
      .update({ notification_prefs: next })
      .eq('id', userId)
  }

  const handleDeleteAccount = () => {
    const confirmDelete = async () => {
      await supabase.auth.signOut()
      router.replace('/(auth)/login')
    }

    if (Platform.OS === 'web') {
      if ((window as any).confirm(
        'Delete your account? This removes all your data permanently. Email support@herenow.app to complete the request.'
      )) {
        confirmDelete()
      }
    } else {
      Alert.alert(
        'Delete Account',
        'This permanently removes your profile, sessions, and connections. Email support@herenow.app to complete the request.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', style: 'destructive', onPress: confirmDelete },
        ]
      )
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} />
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Section title="Account">
          <SettingsRow
            icon="person-outline"
            label="Edit Profile"
            onPress={() => router.push('/profile/edit')}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="lock-closed-outline"
            label="Change Password"
            onPress={() => router.push('/(auth)/forgot-password')}
          />
        </Section>

        <Section title="Privacy">
          <SettingsRow
            icon="eye-off-outline"
            label="Ghost Mode"
            subtitle="Hide your profile and activity from other users while still contributing anonymously to venue analytics."
            value={ghostMode}
            onValueChange={toggleGhostMode}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="shield-checkmark-outline"
            label="Card Visibility"
            subtitle="Control what others see on your profile card"
            onPress={() => router.push('/profile/privacy' as any)}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="document-text-outline"
            label="Privacy Policy"
            onPress={() => router.push('/legal/privacy' as any)}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="reader-outline"
            label="Terms of Service"
            onPress={() => router.push('/legal/terms' as any)}
          />
        </Section>

        <Section title="Notifications">
          <SettingsRow
            icon="megaphone-outline"
            label="Venue Announcements"
            subtitle="When a venue you follow posts an update"
            value={notifPrefs.venue_announcement}
            onValueChange={(v) => updateNotifPref('venue_announcement', v)}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="people-outline"
            label="We Met Confirmed"
            subtitle="When someone confirms a mutual connection"
            value={notifPrefs.wemet_confirmed}
            onValueChange={(v) => updateNotifPref('wemet_confirmed', v)}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="mail-outline"
            label="New Messages"
            subtitle="When you receive a DM"
            value={notifPrefs.message}
            onValueChange={(v) => updateNotifPref('message', v)}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="time-outline"
            label="DM Window Expiring"
            subtitle="Alert 6 hours before a connection window closes"
            value={notifPrefs.dm_expiry}
            onValueChange={(v) => updateNotifPref('dm_expiry', v)}
          />
        </Section>

        <Section title="Help">
          <SettingsRow
            icon="mail-outline"
            label="Contact Support"
            onPress={() => openMail('mailto:support@herenow.app')}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="bug-outline"
            label="Report a Bug"
            onPress={() => openMail('mailto:support@herenow.app?subject=Bug%20Report')}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="help-circle-outline"
            label="FAQ"
            onPress={() => router.push('/faq' as any)}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="information-circle-outline"
            label="About HereNow"
            onPress={() => router.push('/about' as any)}
          />
        </Section>

        <Section title="Danger Zone">
          <SettingsRow
            icon="trash-outline"
            label="Delete Account"
            onPress={handleDeleteAccount}
            destructive
          />
        </Section>

        <Text style={styles.versionText}>HereNow</Text>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#0D1B2E',
  },
  backBtn:  { padding: 8 },
  backText: { fontSize: 22, color: '#f8fafc' },
  title:    { fontSize: 18, fontWeight: '800', color: '#f8fafc' },
  scroll:   { flex: 1 },
  content:  { padding: 16, gap: 20, paddingBottom: 48 },
  section:  { gap: 8 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#4A6580',
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingLeft: 4,
  },
  sectionCard: {
    backgroundColor: '#0D1B2E', borderRadius: 14,
    borderWidth: 1, borderColor: '#1A2E4A', overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 16, gap: 12,
  },
  rowIcon:      { width: 24 },
  rowLabel:     { fontSize: 15, color: '#f8fafc', fontWeight: '500' },
  rowLabelRed:  { color: '#ef4444' },
  rowSubtitle:  { fontSize: 12, color: '#5A7A9A', marginTop: 2, lineHeight: 16 },
  divider: { height: 1, backgroundColor: '#1A2E4A', marginLeft: 52 },
  versionText: { fontSize: 12, color: '#2A3F55', textAlign: 'center', paddingTop: 8 },
})
