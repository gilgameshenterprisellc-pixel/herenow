import { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, Alert, Platform, Linking,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

function SettingsRow({
  icon, label, onPress, value, onValueChange, destructive = false,
}: {
  icon: IoniconsName
  label: string
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
      <Text style={[styles.rowLabel, destructive && styles.rowLabelRed]}>{label}</Text>
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

export default function SettingsScreen() {
  const insets = useSafeAreaInsets()
  const [ghostMode, setGhostMode] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      supabase.from('profiles').select('mood_mode').eq('id', user.id).maybeSingle()
        .then(({ data }) => setGhostMode(data?.mood_mode === 'not_today'))
    })
  }, [])

  const toggleGhostMode = async (val: boolean) => {
    setGhostMode(val)
    if (!userId) return
    await supabase.from('profiles')
      .update({ mood_mode: val ? 'not_today' : 'selective' })
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
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}
          style={styles.backBtn}
        >
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView
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
            value={ghostMode}
            onValueChange={toggleGhostMode}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="shield-checkmark-outline"
            label="Check-in Visibility"
            onPress={() => router.push('/profile/edit')}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="document-text-outline"
            label="Privacy Policy"
            onPress={() => Linking.openURL('https://herenow.app/privacy')}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="reader-outline"
            label="Terms of Service"
            onPress={() => Linking.openURL('https://herenow.app/terms')}
          />
        </Section>

        <Section title="Help">
          <SettingsRow
            icon="mail-outline"
            label="Contact Support"
            onPress={() => Linking.openURL('mailto:support@herenow.app')}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="bug-outline"
            label="Report a Bug"
            onPress={() => Linking.openURL('mailto:support@herenow.app?subject=Bug%20Report')}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="information-circle-outline"
            label="About HereNow"
            onPress={() => Linking.openURL('https://herenow.app')}
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

        <Text style={styles.versionText}>HereNow · Beta</Text>
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
  rowIcon:     { width: 24 },
  rowLabel:    { flex: 1, fontSize: 15, color: '#f8fafc', fontWeight: '500' },
  rowLabelRed: { color: '#ef4444' },
  divider: { height: 1, backgroundColor: '#1A2E4A', marginLeft: 52 },
  versionText: { fontSize: 12, color: '#2A3F55', textAlign: 'center', paddingTop: 8 },
})
