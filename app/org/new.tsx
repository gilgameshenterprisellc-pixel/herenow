import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import BackButton from '@/components/BackButton'
import { useToast } from '@/contexts/ToastContext'
import {
  ORG_CATEGORIES, createOrganization, updateOrganization, fetchOrganization,
  type OrgCategory,
} from '@/lib/organizations'

// Register an Organization — a club, league, brand, or community that runs
// its thing at a host venue (Jacob: "my buddy runs a backgammon meetup
// tournament league at a bar"). With an orgId param this is the edit screen.
export default function NewOrganizationScreen() {
  const insets = useSafeAreaInsets()
  const { orgId } = useLocalSearchParams<{ orgId?: string }>()
  const { showToast } = useToast()
  const isEditing = !!orgId

  const [name, setName]               = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory]       = useState<OrgCategory>('club')
  const [hostZoneId, setHostZoneId]   = useState<string | null>(null)
  const [zones, setZones]             = useState<{ id: string; name: string }[]>([])
  const [zoneSearch, setZoneSearch]   = useState('')
  const [saving, setSaving]           = useState(false)
  const [loadingOrg, setLoadingOrg]   = useState(isEditing)

  useEffect(() => {
    // Host venue picker — live venues, filtered client-side.
    supabase.from('zones').select('id, name').eq('is_active', true).order('name').limit(200)
      .then(({ data }) => setZones((data ?? []) as { id: string; name: string }[]))
  }, [])

  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    fetchOrganization(orgId).then((org) => {
      if (cancelled) return
      if (!org) { showToast('Could not load that organization.', 'error'); router.back(); return }
      setName(org.name)
      setDescription(org.description ?? '')
      setCategory(org.category)
      setHostZoneId(org.host_zone_id)
      setLoadingOrg(false)
    })
    return () => { cancelled = true }
  }, [orgId])

  const handleSubmit = async () => {
    if (!name.trim()) { showToast('Give your organization a name.', 'info'); return }
    setSaving(true)
    if (isEditing) {
      const ok = await updateOrganization(orgId as string, {
        name, description: description || undefined, category, hostZoneId,
      })
      setSaving(false)
      if (!ok) { showToast('Could not save changes. Try again.', 'error'); return }
      showToast('Organization updated.', 'success')
      router.back()
    } else {
      const org = await createOrganization({
        name, description: description || undefined, category, hostZoneId,
      })
      setSaving(false)
      if (!org) { showToast('Could not create the organization. Try again.', 'error'); return }
      showToast('Organization created. 🎉', 'success')
      router.replace(`/org/${org.id}` as any)
    }
  }

  const filteredZones = zoneSearch.trim()
    ? zones.filter((z) => z.name.toLowerCase().includes(zoneSearch.trim().toLowerCase()))
    : zones

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton onPress={() => router.back()} />
        <Text style={styles.title}>{isEditing ? 'Edit Organization' : 'Register an Organization'}</Text>
      </View>

      {loadingOrg ? (
        <ActivityIndicator color="#29B6F6" size="large" style={{ marginTop: 60 }} />
      ) : (
      <ScrollView
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.content,
          Platform.select({ web: { maxWidth: 640, alignSelf: 'center' as any, width: '100%' as any } as any, default: {} }) as any,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {!isEditing && (
          <View style={styles.introCard}>
            <Text style={styles.introText}>
              Run a club, league, brand, or community at a venue? Register it here — members can join,
              you can post announcements to them, and your events show up on the venue's page.
            </Text>
          </View>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Nashville Backgammon Club"
            placeholderTextColor="#4A6580"
            maxLength={60}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Type</Text>
          <View style={styles.chipRow}>
            {ORG_CATEGORIES.map((c) => {
              const active = category === c.id
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setCategory(c.id)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.emoji} {c.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>About (optional)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="What is it, when do you meet, who's welcome?"
            placeholderTextColor="#4A6580"
            multiline
            maxLength={500}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Home venue (optional)</Text>
          <Text style={styles.hint}>Where does your group usually meet? Your org shows up on that venue's page.</Text>
          <TextInput
            style={styles.input}
            value={zoneSearch}
            onChangeText={setZoneSearch}
            placeholder="Search venues…"
            placeholderTextColor="#4A6580"
          />
          <View style={styles.zoneList}>
            {filteredZones.slice(0, 8).map((z) => {
              const active = hostZoneId === z.id
              return (
                <TouchableOpacity
                  key={z.id}
                  style={[styles.zoneRow, active && styles.zoneRowActive]}
                  onPress={() => setHostZoneId(active ? null : z.id)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.zoneRowText, active && { color: '#29B6F6', fontWeight: '700' }]}>
                    {active ? '✓ ' : ''}{z.name}
                  </Text>
                </TouchableOpacity>
              )
            })}
            {filteredZones.length === 0 && (
              <Text style={styles.hint}>No venues match that search.</Text>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, (!name.trim() || saving) && { opacity: 0.4 }]}
          onPress={handleSubmit}
          disabled={!name.trim() || saving}
          activeOpacity={0.85}
        >
          {saving
            ? <ActivityIndicator color="#050A15" />
            : <Text style={styles.submitBtnText}>{isEditing ? 'Save Changes' : 'Create Organization'}</Text>}
        </TouchableOpacity>
      </ScrollView>
      )}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#0D1B2E',
  },
  title: { fontSize: 19, fontWeight: '800', color: '#f8fafc', flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 20, paddingBottom: 60 },
  introCard: {
    backgroundColor: '#29B6F610', borderColor: '#29B6F630', borderWidth: 1,
    borderRadius: 14, padding: 14,
  },
  introText: { fontSize: 13, color: '#8EADC7', lineHeight: 19 },
  field: { gap: 8 },
  label: { fontSize: 13, fontWeight: '700', color: '#8EADC7', textTransform: 'uppercase', letterSpacing: 0.5 },
  hint: { fontSize: 12, color: '#4A6580', lineHeight: 16 },
  input: {
    backgroundColor: '#0D1B2E', borderRadius: 10, padding: 12,
    color: '#f8fafc', fontSize: 14, borderWidth: 1, borderColor: '#1A2E4A',
  },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: '#0D1B2E', borderRadius: 20, borderWidth: 1, borderColor: '#1A2E4A',
    paddingHorizontal: 12, paddingVertical: 8,
  },
  chipActive: { backgroundColor: '#29B6F618', borderColor: '#29B6F6' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#7A93AC' },
  chipTextActive: { color: '#29B6F6' },
  zoneList: { gap: 6 },
  zoneRow: {
    backgroundColor: '#0D1B2E', borderRadius: 10, borderWidth: 1, borderColor: '#1A2E4A',
    paddingHorizontal: 12, paddingVertical: 11,
  },
  zoneRowActive: { borderColor: '#29B6F6', backgroundColor: '#29B6F612' },
  zoneRowText: { fontSize: 14, color: '#B8D4E8' },
  submitBtn: { backgroundColor: '#29B6F6', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  submitBtnText: { color: '#050A15', fontWeight: '800', fontSize: 16 },
})
