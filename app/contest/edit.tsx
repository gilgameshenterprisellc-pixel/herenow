import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator,
  Image, Platform, KeyboardAvoidingView, Switch,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import {
  addOperator, deleteContest, fetchContestBoard, removeOperator, saveContest, uploadContestImage,
  type ContestFields, type ContestOperator,
} from '@/lib/contests'
import {
  ACCENT_PRESETS, DEFAULT_ACCENT, SCORING_PRESETS, normalizeHex, presetFor, textOn, withAlpha,
} from '@/lib/contestFormat'
import { screenText, blockedMessage } from '@/lib/textModeration'
import { screenImage } from '@/lib/moderation'
import { platformConfirm } from '@/lib/confirm'
import BackButton from '@/components/BackButton'

// Set up a contest: what it's called, who presents it, how it looks, how it's
// scored. Opened four ways: ?id= to edit, ?zoneId= for a venue owner making
// one, ?orgId= for an organization making one at its host venue, and
// ?orgId=&zoneId= for an organization making one at a venue it partners with.

export default function EditContestScreen() {
  const params = useLocalSearchParams<{ id?: string; zoneId?: string; orgId?: string }>()
  const contestId = params.id ?? null
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [zoneId, setZoneId] = useState<string | null>(params.zoneId ?? null)
  const [orgId, setOrgId] = useState<string | null>(params.orgId ?? null)
  const [venueName, setVenueName] = useState<string | null>(null)
  const [hasScores, setHasScores] = useState(false)

  const [title, setTitle] = useState('')
  const [tagline, setTagline] = useState('')
  const [presentedBy, setPresentedBy] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [bannerUrl, setBannerUrl] = useState<string | null>(null)
  const [accent, setAccent] = useState(DEFAULT_ACCENT)
  const [customHex, setCustomHex] = useState('')
  const [preset, setPreset] = useState('longest')
  const [label, setLabel] = useState('Time')
  const [suffix, setSuffix] = useState('s')
  const [decimals, setDecimals] = useState(2)
  const [higherWins, setHigherWins] = useState(true)
  const [attempts, setAttempts] = useState(1)
  const [maxEntries, setMaxEntries] = useState('')
  const [rules, setRules] = useState('')
  const [prizes, setPrizes] = useState('')
  const [uploading, setUploading] = useState<'logo' | 'banner' | null>(null)

  const [operators, setOperators] = useState<ContestOperator[]>([])
  const [opName, setOpName] = useState('')
  const [opBusy, setOpBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (contestId) {
        const res = await fetchContestBoard(contestId)
        if (cancelled) return
        const b = res.data
        if (!b || b.role !== 'manager') {
          showToast(res.ok ? "You can't edit this contest." : (res.error ?? 'Could not load it.'), 'error')
          router.canGoBack() ? router.back() : router.replace('/(tabs)/' as any)
          return
        }
        const c = b.contest
        setZoneId(c.zone_id); setOrgId(c.org_id); setVenueName(c.zone_name ?? null)
        setTitle(c.title); setTagline(c.tagline ?? ''); setPresentedBy(c.presented_by ?? '')
        setLogoUrl(c.logo_url); setBannerUrl(c.banner_url); setAccent(c.accent_color)
        setLabel(c.score_label); setSuffix(c.score_suffix); setDecimals(c.score_decimals)
        setHigherWins(c.higher_wins); setAttempts(c.attempts_per_entry)
        setMaxEntries(c.max_entries ? String(c.max_entries) : '')
        setRules(c.rules ?? ''); setPrizes(c.prizes ?? '')
        setPreset(presetFor({ score_label: c.score_label, score_suffix: c.score_suffix,
          score_decimals: c.score_decimals, higher_wins: c.higher_wins }))
        setOperators(b.ops?.operators ?? [])
        setHasScores((b.ops?.attempts ?? []).some((a) => !a.voided))
      } else if (params.orgId && params.zoneId) {
        // An org running a contest at a venue that made it a partner (the
        // database checks the grant; the venue approved it by granting).
        const [{ data: org }, { data: z }] = await Promise.all([
          supabase.from('organizations').select('name').eq('id', params.orgId).maybeSingle(),
          supabase.from('zones').select('name').eq('id', params.zoneId).maybeSingle(),
        ])
        if (cancelled) return
        setVenueName(z?.name ?? null)
        if (org?.name) setPresentedBy(org.name)
      } else if (params.orgId) {
        // An org runs contests at the venue it calls home.
        const { data: org } = await supabase
          .from('organizations').select('id, name, host_zone_id, zones:host_zone_id(name)')
          .eq('id', params.orgId).maybeSingle()
        if (cancelled) return
        if (!org?.host_zone_id) {
          showToast('Set a home venue for your organization first.', 'error')
          router.canGoBack() ? router.back() : router.replace(`/org/${params.orgId}` as any)
          return
        }
        setZoneId(org.host_zone_id)
        setVenueName((org as any).zones?.name ?? null)
        setPresentedBy(org.name)
      } else if (params.zoneId) {
        const { data: z } = await supabase.from('zones').select('name').eq('id', params.zoneId).maybeSingle()
        if (!cancelled) setVenueName(z?.name ?? null)
      }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contestId, params.orgId, params.zoneId])

  const pickPreset = (id: string) => {
    setPreset(id)
    const p = SCORING_PRESETS.find((s) => s.id === id)
    if (!p) return
    setLabel(p.shape.score_label); setSuffix(p.shape.score_suffix)
    setDecimals(p.shape.score_decimals); setHigherWins(p.shape.higher_wins)
  }

  const pickImage = async (kind: 'logo' | 'banner') => {
    if (!zoneId || uploading) return
    setUploading(kind)
    try {
      let body: Blob | ArrayBuffer | null = null
      let type = 'image/jpeg'
      if (Platform.OS === 'web') {
        const file = await new Promise<File | null>((resolve) => {
          const input = document.createElement('input')
          input.type = 'file'; input.accept = 'image/*'
          input.onchange = () => resolve(input.files?.[0] ?? null)
          input.click()
        })
        if (!file) return
        body = file; type = file.type || type
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (status !== 'granted') { showToast('Photo access needed.', 'error'); return }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'], quality: 0.85, allowsEditing: true,
          aspect: kind === 'logo' ? [1, 1] : [16, 9],
        })
        if (result.canceled || !result.assets[0]) return
        body = await (await fetch(result.assets[0].uri)).arrayBuffer()
        type = result.assets[0].mimeType || type
      }
      const up = await uploadContestImage(zoneId, kind, body, type)
      if (!up.ok || !up.data) { showToast(up.error ?? 'Upload failed.', 'error'); return }
      const shot = await screenImage(up.data)
      if (!shot.ok) { showToast(shot.reason ?? "That image can't be used.", 'error'); return }
      if (kind === 'logo') setLogoUrl(up.data); else setBannerUrl(up.data)
    } catch {
      showToast('Could not add that image.', 'error')
    } finally {
      setUploading(null)
    }
  }

  const applyCustomHex = () => {
    const hex = normalizeHex(customHex)
    if (!hex) { showToast('Use a 6-digit hex color, like #29B6F6.', 'error'); return }
    setAccent(hex); setCustomHex('')
  }

  const onSave = async () => {
    if (saving) return
    if (!title.trim()) { showToast('Give the contest a name.', 'error'); return }
    for (const t of [title, tagline, presentedBy, rules, prizes, label]) {
      if (!t) continue
      const s = screenText(t)
      if (!s.ok) { showToast(blockedMessage(s.category), 'error'); return }
    }
    const cap = maxEntries.trim() ? Number(maxEntries) : null
    if (cap !== null && (!Number.isInteger(cap) || cap < 1 || cap > 1000)) {
      showToast('Max entrants has to be a whole number from 1 to 1000.', 'error'); return
    }
    const fields: ContestFields = {
      title: title.trim(), tagline: tagline.trim() || null, presented_by: presentedBy.trim() || null,
      logo_url: logoUrl, banner_url: bannerUrl, accent_color: accent,
      score_label: label.trim() || 'Score', score_suffix: suffix.trim(), score_decimals: decimals,
      higher_wins: higherWins, attempts_per_entry: attempts, max_entries: cap,
      rules: rules.trim() || null, prizes: prizes.trim() || null,
    }
    setSaving(true)
    const res = await saveContest(contestId, { zoneId, orgId }, fields)
    setSaving(false)
    if (!res.ok || !res.data) { showToast(res.error ?? 'Could not save.', 'error'); return }
    if (contestId) {
      showToast('Saved', 'success')
      router.canGoBack() ? router.back() : router.replace(`/contest/run/${contestId}` as any)
    } else {
      showToast("Created as a draft. Publish it when you're ready.", 'success')
      router.replace(`/contest/run/${res.data}` as any)
    }
  }

  const onAddOperator = async () => {
    if (!contestId || !opName.trim() || opBusy) return
    setOpBusy(true)
    const res = await addOperator(contestId, opName.trim())
    setOpBusy(false)
    if (!res.ok || !res.data) { showToast(res.error ?? 'Could not add them.', 'error'); return }
    const added = res.data
    setOperators((prev) => prev.some((o) => o.user_id === added.user_id) ? prev : [...prev, added])
    setOpName('')
    showToast(`${added.display_name ?? added.username} can run this contest`, 'success')
  }

  const onRemoveOperator = (op: ContestOperator) => {
    if (!contestId) return
    platformConfirm(`Remove ${op.display_name ?? op.username}?`, "They won't be able to run this contest anymore.", async () => {
      const res = await removeOperator(contestId, op.user_id)
      if (!res.ok) { showToast(res.error ?? 'Could not remove them.', 'error'); return }
      setOperators((prev) => prev.filter((o) => o.user_id !== op.user_id))
    }, { confirmText: 'Remove', destructive: true })
  }

  const onDelete = () => {
    if (!contestId) return
    platformConfirm('Delete this contest?', 'Everyone\'s scores and the whole board are deleted for good. To take it down for now, use Hide instead.', async () => {
      const res = await deleteContest(contestId)
      if (!res.ok) { showToast(res.error ?? 'Could not delete it.', 'error'); return }
      showToast('Deleted', 'success')
      router.replace((orgId ? `/contest/manage?orgId=${orgId}` : `/contest/manage?zoneId=${zoneId}`) as any)
    }, { confirmText: 'Delete', destructive: true })
  }

  if (loading) {
    return <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color="#29B6F6" /></View>
  }

  const onAccent = textOn(accent)

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <BackButton />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{contestId ? 'Edit contest' : 'New contest'}</Text>
          {venueName ? <Text style={styles.headerSub}>at {venueName}</Text> : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
        {/* Live preview of the card people will tap */}
        <View style={[styles.preview, { borderColor: withAlpha(accent, 0.5) }]}>
          {bannerUrl ? <Image source={{ uri: bannerUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: bannerUrl ? 'rgba(5,10,21,0.55)' : withAlpha(accent, 0.1) }]} />
          <Text style={[styles.previewKicker, { color: accent }]}>
            {presentedBy.trim() ? `PRESENTED BY ${presentedBy.trim().toUpperCase()}` : 'LIVE CONTEST'}
          </Text>
          <Text style={styles.previewTitle} numberOfLines={2}>{title.trim() || 'Your contest name'}</Text>
          {tagline.trim() ? <Text style={styles.previewTag} numberOfLines={2}>{tagline.trim()}</Text> : null}
          <View style={[styles.previewBtn, { backgroundColor: accent }]}>
            <Text style={[styles.previewBtnText, { color: onAccent }]}>Sign me up</Text>
          </View>
        </View>

        <Section label="Basics">
          <Field label="Name *">
            <TextInput style={styles.input} value={title} onChangeText={setTitle} maxLength={80}
              placeholder="Mechanical Bull Showdown" placeholderTextColor="#4A6580" />
          </Field>
          <Field label="Tagline">
            <TextInput style={styles.input} value={tagline} onChangeText={setTagline} maxLength={140}
              placeholder="Longest ride tonight takes the crown" placeholderTextColor="#4A6580" />
          </Field>
          <Field label="Presented by">
            <TextInput style={styles.input} value={presentedBy} onChangeText={setPresentedBy} maxLength={60}
              placeholder="A sponsor or partner, optional" placeholderTextColor="#4A6580" />
          </Field>
        </Section>

        <Section label="Look">
          <View style={styles.imageRow}>
            <TouchableOpacity style={styles.imagePick} onPress={() => pickImage('logo')}>
              {logoUrl ? <Image source={{ uri: logoUrl }} style={styles.logoImg} resizeMode="contain" /> :
                uploading === 'logo' ? <ActivityIndicator color={accent} /> :
                <Ionicons name="image-outline" size={22} color="#7A93AC" />}
              <Text style={styles.imagePickText}>{logoUrl ? 'Change logo' : 'Logo'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.imagePick, { flex: 2 }]} onPress={() => pickImage('banner')}>
              {bannerUrl ? <Image source={{ uri: bannerUrl }} style={styles.bannerImg} resizeMode="cover" /> :
                uploading === 'banner' ? <ActivityIndicator color={accent} /> :
                <Ionicons name="images-outline" size={22} color="#7A93AC" />}
              <Text style={styles.imagePickText}>{bannerUrl ? 'Change banner' : 'Banner'}</Text>
            </TouchableOpacity>
          </View>
          {(logoUrl || bannerUrl) ? (
            <View style={styles.row}>
              {logoUrl ? <TouchableOpacity onPress={() => setLogoUrl(null)}><Text style={styles.linkText}>Remove logo</Text></TouchableOpacity> : null}
              {bannerUrl ? <TouchableOpacity onPress={() => setBannerUrl(null)}><Text style={styles.linkText}>Remove banner</Text></TouchableOpacity> : null}
            </View>
          ) : null}
          <Text style={styles.fieldLabel}>Accent color</Text>
          <View style={styles.swatches}>
            {ACCENT_PRESETS.map((p) => (
              <TouchableOpacity key={p.hex} onPress={() => setAccent(p.hex)} accessibilityLabel={p.label}
                style={[styles.swatch, { backgroundColor: p.hex }, accent === p.hex && styles.swatchOn]} />
            ))}
            {!ACCENT_PRESETS.some((p) => p.hex === accent) ? (
              <View style={[styles.swatch, { backgroundColor: accent }, styles.swatchOn]} />
            ) : null}
          </View>
          <View style={styles.row}>
            <TextInput style={[styles.input, { flex: 1 }]} value={customHex} onChangeText={setCustomHex}
              placeholder="Brand color, like #7AC143" placeholderTextColor="#4A6580" autoCapitalize="characters" maxLength={7} />
            <TouchableOpacity style={styles.smallBtn} onPress={applyCustomHex}>
              <Text style={styles.smallBtnText}>Use</Text>
            </TouchableOpacity>
          </View>
        </Section>

        <Section label="Scoring">
          {hasScores ? (
            <Text style={styles.hint}>Scores are in, so who wins (highest or lowest) is locked. Labels can still change.</Text>
          ) : null}
          <View style={styles.presetGrid}>
            {[...SCORING_PRESETS, { id: 'custom', label: 'Custom', hint: 'Your own unit' }].map((p) => {
              const on = preset === p.id
              return (
                <TouchableOpacity key={p.id} onPress={() => (p.id === 'custom' ? setPreset('custom') : pickPreset(p.id))}
                  disabled={hasScores && p.id !== 'custom' && SCORING_PRESETS.find((s) => s.id === p.id)?.shape.higher_wins !== higherWins}
                  style={[styles.preset, on && { borderColor: accent, backgroundColor: withAlpha(accent, 0.12) }]}>
                  <Text style={[styles.presetLabel, on && { color: accent }]}>{p.label}</Text>
                  <Text style={styles.presetHint}>{p.hint}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
          {preset === 'custom' ? (
            <>
              <View style={styles.row}>
                <Field label="Label" style={{ flex: 2 }}>
                  <TextInput style={styles.input} value={label} onChangeText={setLabel} maxLength={24}
                    placeholder="Pins" placeholderTextColor="#4A6580" />
                </Field>
                <Field label="Unit" style={{ flex: 1 }}>
                  <TextInput style={styles.input} value={suffix} onChangeText={setSuffix} maxLength={8}
                    placeholder="pts" placeholderTextColor="#4A6580" />
                </Field>
              </View>
              <Stepper label="Decimal places" value={decimals} min={0} max={3} onChange={setDecimals} />
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>{higherWins ? 'Highest score wins' : 'Lowest score wins'}</Text>
                <Switch value={higherWins} onValueChange={setHigherWins} disabled={hasScores}
                  trackColor={{ true: accent, false: '#1A2E4A' }} thumbColor="#F8FAFC" />
              </View>
            </>
          ) : null}
          <Stepper label="Attempts per person" value={attempts} min={1} max={10} onChange={setAttempts}
            hint={attempts > 1 ? 'Best one counts. People go to the back of the line between attempts.' : undefined} />
          <Field label="Max entrants">
            <TextInput style={styles.input} value={maxEntries} onChangeText={(t) => setMaxEntries(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad" placeholder="No limit" placeholderTextColor="#4A6580" maxLength={4} />
          </Field>
        </Section>

        <Section label="Prizes and rules">
          <Field label="Prizes">
            <TextInput style={[styles.input, styles.multi]} value={prizes} onChangeText={setPrizes} multiline maxLength={1000}
              placeholder="What the winners get, if anything" placeholderTextColor="#4A6580" />
          </Field>
          <Field label="Official rules">
            <TextInput style={[styles.input, styles.multi, { minHeight: 140 }]} value={rules} onChangeText={setRules} multiline maxLength={4000}
              placeholder="Who can enter, how it works, how winners are picked" placeholderTextColor="#4A6580" />
          </Field>
          <Text style={styles.hint}>
            The app adds a line to every contest's rules saying it's free to enter and that Apple isn't a sponsor, which the App Store requires.
          </Text>
        </Section>

        {contestId ? (
          <Section label="Operators">
            <Text style={styles.hint}>People who can run it live: call people up, enter scores, open and close signups. They need a HereNow account.</Text>
            {operators.map((op) => (
              <View key={op.user_id} style={styles.opRow}>
                <Ionicons name="person-circle-outline" size={22} color="#8EADC7" />
                <Text style={styles.opName} numberOfLines={1}>
                  {op.display_name ?? op.username}{op.username ? <Text style={styles.opUser}>  @{op.username}</Text> : null}
                </Text>
                <TouchableOpacity onPress={() => onRemoveOperator(op)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button" accessibilityLabel={`Remove ${op.display_name ?? op.username} as an operator`}>
                  <Ionicons name="close" size={20} color="#7A93AC" />
                </TouchableOpacity>
              </View>
            ))}
            <View style={styles.row}>
              <TextInput style={[styles.input, { flex: 1 }]} value={opName} onChangeText={setOpName}
                placeholder="@username" placeholderTextColor="#4A6580" autoCapitalize="none" autoCorrect={false}
                onSubmitEditing={onAddOperator} returnKeyType="done" />
              <TouchableOpacity style={styles.smallBtn} onPress={onAddOperator} disabled={opBusy}>
                {opBusy ? <ActivityIndicator color="#29B6F6" /> : <Text style={styles.smallBtnText}>Add</Text>}
              </TouchableOpacity>
            </View>
          </Section>
        ) : (
          <Text style={styles.hint}>After you create it you can add operators, then publish it when you're ready.</Text>
        )}

        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: accent }, saving && { opacity: 0.6 }]} onPress={onSave} disabled={saving}>
          {saving ? <ActivityIndicator color={onAccent} /> :
            <Text style={[styles.saveText, { color: onAccent }]}>{contestId ? 'Save changes' : 'Create contest'}</Text>}
        </TouchableOpacity>

        {contestId ? (
          <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
            <Text style={styles.deleteText}>Delete contest</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>
      {children}
    </View>
  )
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: any }) {
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  )
}

function Stepper({ label, value, min, max, onChange, hint }: {
  label: string; value: number; min: number; max: number; onChange: (n: number) => void; hint?: string
}) {
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{label}</Text>
        <View style={styles.stepper}>
          <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>
            <Ionicons name="remove" size={18} color={value <= min ? '#1A2E4A' : '#F8FAFC'} />
          </TouchableOpacity>
          <Text style={styles.stepValue}>{value}</Text>
          <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>
            <Ionicons name="add" size={18} color={value >= max ? '#1A2E4A' : '#F8FAFC'} />
          </TouchableOpacity>
        </View>
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#0D1B2E',
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#F8FAFC' },
  headerSub: { fontSize: 12, color: '#7A93AC' },
  content: {
    padding: 16, gap: 20,
    ...Platform.select({ web: { maxWidth: 680, alignSelf: 'center', width: '100%' } as any, default: {} }),
  },

  preview: {
    borderRadius: 18, borderWidth: 1, padding: 18, gap: 6, overflow: 'hidden', minHeight: 170,
    justifyContent: 'flex-end', backgroundColor: '#07101F',
  },
  previewKicker: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  previewTitle: { fontSize: 24, fontWeight: '900', color: '#F8FAFC' },
  previewTag: { fontSize: 14, color: '#CBD5E1' },
  previewBtn: { marginTop: 8, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  previewBtnText: { fontSize: 14, fontWeight: '900' },

  section: { gap: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '900', color: '#7A93AC', letterSpacing: 1.4 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#CBD5E1' },
  hint: { fontSize: 12, color: '#7A93AC', lineHeight: 17 },
  input: {
    backgroundColor: '#0D1B2E', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, minHeight: 46,
    color: '#F8FAFC', fontSize: 15, borderWidth: 1, borderColor: '#1A2E4A',
  },
  multi: { minHeight: 90, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  linkText: { fontSize: 13, color: '#7A93AC', fontWeight: '700' },

  imageRow: { flexDirection: 'row', gap: 10 },
  imagePick: {
    flex: 1, height: 96, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#1A2E4A',
    backgroundColor: '#0D1B2E', alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden',
  },
  imagePickText: { fontSize: 12, color: '#7A93AC', fontWeight: '700' },
  logoImg: { width: 48, height: 48, borderRadius: 8 },
  bannerImg: { width: '100%', height: 60 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent' },
  swatchOn: { borderColor: '#F8FAFC', transform: [{ scale: 1.08 }] },
  smallBtn: {
    height: 46, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#1A2E4A', backgroundColor: '#0D1B2E',
  },
  smallBtnText: { fontSize: 14, fontWeight: '800', color: '#29B6F6' },

  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: {
    flexBasis: '48%', flexGrow: 1, padding: 12, borderRadius: 12, gap: 2,
    borderWidth: 1, borderColor: '#1A2E4A', backgroundColor: '#0D1B2E', minHeight: 56,
  },
  presetLabel: { fontSize: 14, fontWeight: '800', color: '#F8FAFC' },
  presetHint: { fontSize: 11, color: '#7A93AC' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
  switchLabel: { fontSize: 14, fontWeight: '700', color: '#F8FAFC', flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: {
    width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0D1B2E', borderWidth: 1, borderColor: '#1A2E4A',
  },
  stepValue: { minWidth: 32, textAlign: 'center', fontSize: 16, fontWeight: '900', color: '#F8FAFC' },

  opRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12,
    borderRadius: 10, backgroundColor: '#0D1B2E', borderWidth: 1, borderColor: '#1A2E4A',
  },
  opName: { flex: 1, fontSize: 14, fontWeight: '700', color: '#F8FAFC' },
  opUser: { fontSize: 12, fontWeight: '500', color: '#7A93AC' },

  saveBtn: { height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  saveText: { fontSize: 17, fontWeight: '900' },
  deleteBtn: { alignItems: 'center', paddingVertical: 14 },
  deleteText: { fontSize: 14, fontWeight: '800', color: '#F43F5E' },
})
