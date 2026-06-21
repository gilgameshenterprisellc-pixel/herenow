import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import AvatarImage from '@/components/AvatarImage'
import { uploadAvatarWeb } from '@/lib/uploadAvatar'

const AGE_RANGES = ['18–22', '23–27', '28–34', '35–45', '45+', 'Prefer not to say']

const COMMON_INTERESTS = [
  'Music', 'Sports', 'Gaming', 'Art', 'Tech', 'Fitness',
  'Film', 'Food', 'Travel', 'Writing', 'Comedy', 'Fashion',
  'Photography', 'Outdoors', 'Dance', 'Books',
]

const KICKOFF_PROMPTS = [
  "Ask me about...",
  "Best conversation starter...",
  "I'll never say no to...",
  "Unpopular opinion:",
  "Right now I'm obsessed with...",
  "My go-to is...",
]

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets()
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [uploading, setUploading]     = useState(false)
  const [userId, setUserId]           = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl]     = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio]                 = useState('')
  const [ageRange, setAgeRange]       = useState('')
  const [interests, setInterests]     = useState<string[]>([])
  const [kickoff, setKickoff]         = useState('')
  const [kickoffTemplate, setKickoffTemplate] = useState('')

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/(auth)/login'); return }
      setUserId(user.id)
      const { data } = await supabase
        .from('profiles')
        .select('display_name, bio, age_range, interest_tags, kickoffs, avatar_url')
        .eq('id', user.id)
        .maybeSingle()
      if (data) {
        setDisplayName(data.display_name ?? '')
        setBio(data.bio ?? '')
        setAgeRange(data.age_range ?? '')
        setInterests(data.interest_tags ?? [])
        setKickoff(data.kickoffs?.[0] ?? '')
        setAvatarUrl(data.avatar_url ?? null)
      }
      setLoading(false)
    }
    load()
  }, [])

  const handlePhotoUpload = async () => {
    if (!userId) return
    setUploading(true)
    const url = await uploadAvatarWeb(userId)
    if (url) {
      await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId)
      setAvatarUrl(url)
    }
    setUploading(false)
  }

  const toggleInterest = (tag: string) => {
    setInterests((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  const applyKickoffTemplate = (template: string) => {
    setKickoffTemplate(template)
    setKickoff(template + ' ')
  }

  const handleSave = async () => {
    if (!displayName.trim()) {
      Alert.alert('Display name required', 'Enter a name so people can recognize you.')
      return
    }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase
      .from('profiles')
      .update({
        display_name:  displayName.trim(),
        bio:           bio.trim() || null,
        age_range:     ageRange || null,
        interest_tags: interests,
        kickoffs:      kickoff.trim() ? [kickoff.trim()] : [],
      })
      .eq('id', user.id)

    setSaving(false)
    // Replace so new users from signup land on the app, not back on (auth)
    router.replace('/(tabs)')
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#29B6F6" />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Edit Profile</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        >
          {saving
            ? <ActivityIndicator color="#050A15" size="small" />
            : <Text style={styles.saveBtnText}>Save</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Photo */}
        <View style={styles.photoSection}>
          <TouchableOpacity
            style={styles.photoWrap}
            onPress={handlePhotoUpload}
            disabled={uploading || Platform.OS !== 'web'}
          >
            <AvatarImage uri={avatarUrl} name={displayName || '?'} size={80} />
            <View style={styles.photoOverlay}>
              {uploading
                ? <ActivityIndicator color="#f8fafc" size="small" />
                : <Text style={styles.photoOverlayText}>{avatarUrl ? '✏️' : '📷'}</Text>
              }
            </View>
          </TouchableOpacity>
          <View style={styles.photoMeta}>
            <Text style={styles.photoTitle}>Profile Photo</Text>
            <Text style={styles.photoHint}>
              {Platform.OS === 'web'
                ? 'Tap to upload · JPG, PNG, or WebP · max 5MB'
                : 'Open on web to upload a photo'}
            </Text>
          </View>
        </View>

        {/* Display name */}
        <View style={styles.field}>
          <Text style={styles.label}>Display Name *</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="What should people call you?"
            placeholderTextColor="#4A6580"
            maxLength={32}
          />
          <Text style={styles.hint}>Shown to others at venues. First name or alias — up to you.</Text>
        </View>

        {/* Bio */}
        <View style={styles.field}>
          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={bio}
            onChangeText={setBio}
            placeholder="What's your deal? (optional)"
            placeholderTextColor="#4A6580"
            multiline
            maxLength={160}
          />
          <Text style={styles.charCount}>{bio.length}/160</Text>
        </View>

        {/* Age range */}
        <View style={styles.field}>
          <Text style={styles.label}>Age Range</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pills}
          >
            {AGE_RANGES.map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.pill, ageRange === r && styles.pillActive]}
                onPress={() => setAgeRange(ageRange === r ? '' : r)}
              >
                <Text style={[styles.pillText, ageRange === r && styles.pillTextActive]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Interests */}
        <View style={styles.field}>
          <Text style={styles.label}>Interests ({interests.length} selected)</Text>
          <View style={styles.interestGrid}>
            {COMMON_INTERESTS.map((tag) => {
              const active = interests.includes(tag)
              return (
                <TouchableOpacity
                  key={tag}
                  style={[styles.interestTag, active && styles.interestTagActive]}
                  onPress={() => toggleInterest(tag)}
                >
                  <Text style={[styles.interestText, active && styles.interestTextActive]}>
                    {tag}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Kickoff prompt */}
        <View style={styles.field}>
          <Text style={styles.label}>Conversation Kickoff</Text>
          <Text style={styles.hint}>Shown on your People card to help others start a convo.</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pills}
            style={styles.templateScroll}
          >
            {KICKOFF_PROMPTS.map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.pill, kickoffTemplate === p && styles.pillActive]}
                onPress={() => applyKickoffTemplate(p)}
              >
                <Text style={[styles.pillText, kickoffTemplate === p && styles.pillTextActive]}>
                  {p}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={kickoff}
            onChangeText={setKickoff}
            placeholder="e.g. Ask me about my last trip..."
            placeholderTextColor="#4A6580"
            multiline
            maxLength={120}
          />
          <Text style={styles.charCount}>{kickoff.length}/120</Text>
        </View>

        {/* Privacy note */}
        <View style={styles.privacyNote}>
          <Text style={styles.privacyText}>
            🔒 Your profile is only visible to people checked in to the same venue at the same time.
            It's never searchable and disappears when your session ends.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  center: { flex: 1, backgroundColor: '#050A15', alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#0D1B2E',
    gap: 12,
  },
  backBtn: { padding: 8 },
  backText: { fontSize: 22, color: '#f8fafc' },
  title: { fontSize: 18, fontWeight: '800', color: '#f8fafc', flex: 1 },
  saveBtn: {
    backgroundColor: '#29B6F6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#050A15', fontWeight: '800', fontSize: 14 },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 24, paddingBottom: 60 },
  photoSection: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 4 },
  photoWrap: { position: 'relative', flexShrink: 0 },
  photoOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#29B6F6', borderWidth: 2, borderColor: '#050A15',
    alignItems: 'center', justifyContent: 'center',
  },
  photoOverlayText: { fontSize: 12 },
  photoMeta: { flex: 1, gap: 4 },
  photoTitle: { fontSize: 14, fontWeight: '700', color: '#f8fafc' },
  photoHint: { fontSize: 12, color: '#4A6580', lineHeight: 16 },
  field: { gap: 8 },
  label: { fontSize: 13, fontWeight: '700', color: '#8EADC7', textTransform: 'uppercase', letterSpacing: 0.5 },
  hint: { fontSize: 12, color: '#4A6580', lineHeight: 16 },
  input: {
    backgroundColor: '#0D1B2E',
    borderRadius: 10,
    padding: 12,
    color: '#f8fafc',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#1A2E4A',
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  charCount: { fontSize: 11, color: '#4A6580', textAlign: 'right' },
  pills: { gap: 8, flexDirection: 'row', paddingVertical: 4 },
  templateScroll: { marginBottom: 8 },
  pill: {
    backgroundColor: '#0D1B2E',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#1A2E4A',
  },
  pillActive: { backgroundColor: '#29B6F618', borderColor: '#29B6F6' },
  pillText: { fontSize: 13, color: '#8EADC7' },
  pillTextActive: { color: '#29B6F6', fontWeight: '700' },
  interestGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  interestTag: {
    backgroundColor: '#0D1B2E',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#1A2E4A',
  },
  interestTagActive: { backgroundColor: '#29B6F618', borderColor: '#29B6F6' },
  interestText: { fontSize: 13, color: '#8EADC7' },
  interestTextActive: { color: '#29B6F6', fontWeight: '700' },
  privacyNote: {
    backgroundColor: '#0D1B2E',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1A2E4A',
  },
  privacyText: { fontSize: 12, color: '#7A93AC', lineHeight: 17, textAlign: 'center' },
})
