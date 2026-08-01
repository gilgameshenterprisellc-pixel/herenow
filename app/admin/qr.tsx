import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, TextInput,
  TouchableOpacity, Image, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import BackButton from '@/components/BackButton'
import { useToast } from '@/contexts/ToastContext'
import { supabase } from '@/lib/supabase'
import {
  QR_PLACEMENTS, placementLabel, qrUrl, qrImageUrl,
  listQrCodes, createQrCode, setQrActive, qrScanCounts, type QrCode,
} from '@/lib/qr'

interface Venue { id: string; name: string }

export default function AdminQr() {
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()

  const [venues, setVenues]         = useState<Venue[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [selected, setSelected]     = useState<Venue | null>(null)

  const [codes, setCodes]           = useState<QrCode[]>([])
  const [counts, setCounts]         = useState<Record<string, number>>({})
  const [codesLoading, setCodesLoading] = useState(false)
  const [placement, setPlacement]   = useState(QR_PLACEMENTS[0].slug)
  const [customLabel, setCustomLabel] = useState('')
  const [creating, setCreating]     = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('zones').select('id, name').order('name')
      setVenues((data as Venue[]) ?? [])
      setLoading(false)
    })()
  }, [])

  const loadCodes = useCallback(async (zoneId: string) => {
    setCodesLoading(true)
    const [c, n] = await Promise.all([listQrCodes(zoneId), qrScanCounts(zoneId)])
    setCodes(c)
    setCounts(n)
    setCodesLoading(false)
  }, [])

  const selectVenue = (v: Venue) => {
    setSelected(v)
    setCodes([])
    setCounts({})
    loadCodes(v.id)
  }

  const create = async () => {
    if (!selected) return
    setCreating(true)
    const made = await createQrCode(selected.id, placement, customLabel)
    setCreating(false)
    if (!made) { showToast('Could not create code — admin only.', 'error'); return }
    setCustomLabel('')
    showToast(`Code created for ${placementLabel(placement)}`, 'success')
    loadCodes(selected.id)
  }

  const toggle = async (c: QrCode) => {
    await setQrActive(c.id, !c.is_active)
    loadCodes(selected!.id)
  }

  const copyUrl = async (code: string) => {
    try {
      if (Platform.OS === 'web' && navigator?.clipboard) {
        await navigator.clipboard.writeText(qrUrl(code))
        showToast('Link copied', 'success')
      } else {
        showToast(qrUrl(code), 'info')
      }
    } catch { showToast(qrUrl(code), 'info') }
  }

  const download = async (c: QrCode) => {
    if (Platform.OS !== 'web') { showToast('Download from the web admin to print.', 'info'); return }
    try {
      const res = await fetch(qrImageUrl(c.code, 1000))
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      // @ts-ignore web-only
      const a = document.createElement('a')
      a.href = url
      a.download = `herenow-${(selected?.name ?? 'venue').replace(/\W+/g, '-').toLowerCase()}-${c.placement}.png`
      a.click()
      URL.revokeObjectURL(url)
    } catch { showToast('Download failed — try Copy link and generate manually.', 'error') }
  }

  const filtered = venues.filter((v) => v.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton />
        <Text style={styles.title}>QR Codes</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#29B6F6" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.intro}>
            One code per physical placement, so you can see which material actually
            converts. Print the code, stick it up, watch the scans.
          </Text>

          {/* Venue picker */}
          {!selected ? (
            <>
              <TextInput
                style={styles.searchInput}
                placeholder="Search venues…"
                placeholderTextColor="#5b7089"
                value={search}
                onChangeText={setSearch}
              />
              {filtered.map((v) => (
                <TouchableOpacity key={v.id} style={styles.venueRow} onPress={() => selectVenue(v)}>
                  <Text style={styles.venueName}>{v.name}</Text>
                  <Ionicons name="chevron-forward" size={18} color="#5b7089" />
                </TouchableOpacity>
              ))}
              {filtered.length === 0 && <Text style={styles.empty}>No venues match.</Text>}
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.changeVenue} onPress={() => setSelected(null)}>
                <Ionicons name="chevron-back" size={16} color="#29B6F6" />
                <Text style={styles.changeVenueText}>All venues</Text>
              </TouchableOpacity>
              <Text style={styles.venueTitle}>{selected.name}</Text>

              {/* Create */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Add a code</Text>
                <View style={styles.pillWrap}>
                  {QR_PLACEMENTS.map((p) => (
                    <TouchableOpacity
                      key={p.slug}
                      style={[styles.pill, placement === p.slug && styles.pillActive]}
                      onPress={() => setPlacement(p.slug)}
                    >
                      <Text style={[styles.pillText, placement === p.slug && styles.pillTextActive]}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.labelInput}
                  placeholder={`Label (optional, defaults to "${placementLabel(placement)}")`}
                  placeholderTextColor="#5b7089"
                  value={customLabel}
                  onChangeText={setCustomLabel}
                />
                <TouchableOpacity style={[styles.createBtn, creating && { opacity: 0.5 }]} onPress={create} disabled={creating}>
                  <Text style={styles.createBtnText}>{creating ? 'Creating…' : 'Create code'}</Text>
                </TouchableOpacity>
              </View>

              {/* List */}
              {codesLoading ? (
                <ActivityIndicator color="#29B6F6" style={{ marginTop: 20 }} />
              ) : codes.length === 0 ? (
                <Text style={styles.empty}>No codes yet. Add one above.</Text>
              ) : (
                codes.map((c) => (
                  <View key={c.id} style={[styles.codeCard, !c.is_active && { opacity: 0.5 }]}>
                    <Image source={{ uri: qrImageUrl(c.code, 240) }} style={styles.qrImg} />
                    <View style={styles.codeInfo}>
                      <Text style={styles.codeLabel}>{c.label ?? placementLabel(c.placement)}</Text>
                      <Text style={styles.codePlacement}>{placementLabel(c.placement)}</Text>
                      <Text style={styles.codeScans}>{counts[c.id] ?? 0} scans</Text>
                      <Text style={styles.codeUrl} numberOfLines={1}>{qrUrl(c.code)}</Text>
                      <View style={styles.codeActions}>
                        <TouchableOpacity style={styles.codeBtn} onPress={() => download(c)}>
                          <Ionicons name="download-outline" size={15} color="#29B6F6" />
                          <Text style={styles.codeBtnText}>Download</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.codeBtn} onPress={() => copyUrl(c.code)}>
                          <Ionicons name="link-outline" size={15} color="#29B6F6" />
                          <Text style={styles.codeBtnText}>Copy link</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.codeBtn} onPress={() => toggle(c)}>
                          <Text style={styles.codeBtnText}>{c.is_active ? 'Deactivate' : 'Reactivate'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#0D1B2E' },
  title: { fontSize: 20, fontWeight: '800', color: '#f8fafc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12 },
  intro: { color: '#7A93AC', fontSize: 14, lineHeight: 20 },
  searchInput: { backgroundColor: '#0D1B2E', borderColor: '#1A2E4A', borderWidth: 1, borderRadius: 12, padding: 12, color: '#f8fafc', fontSize: 15 },
  venueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0D1B2E', borderRadius: 12, padding: 14 },
  venueName: { color: '#f8fafc', fontSize: 15, fontWeight: '600' },
  empty: { color: '#7A93AC', fontSize: 14, textAlign: 'center', marginTop: 16 },
  changeVenue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  changeVenueText: { color: '#29B6F6', fontSize: 14, fontWeight: '600' },
  venueTitle: { color: '#f8fafc', fontSize: 22, fontWeight: '800' },
  card: { backgroundColor: '#0D1B2E', borderRadius: 14, padding: 16, gap: 12 },
  cardTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '700' },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: '#1A2E4A', backgroundColor: '#07101F' },
  pillActive: { backgroundColor: '#29B6F622', borderColor: '#29B6F6' },
  pillText: { color: '#8EADC7', fontSize: 13, fontWeight: '600' },
  pillTextActive: { color: '#29B6F6' },
  labelInput: { backgroundColor: '#07101F', borderColor: '#1A2E4A', borderWidth: 1, borderRadius: 10, padding: 11, color: '#f8fafc', fontSize: 14 },
  createBtn: { backgroundColor: '#29B6F6', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  createBtnText: { color: '#050A15', fontSize: 15, fontWeight: '800' },
  codeCard: { flexDirection: 'row', gap: 14, backgroundColor: '#0D1B2E', borderRadius: 14, padding: 14 },
  qrImg: { width: 90, height: 90, borderRadius: 8, backgroundColor: '#fff' },
  codeInfo: { flex: 1, gap: 3 },
  codeLabel: { color: '#f8fafc', fontSize: 15, fontWeight: '700' },
  codePlacement: { color: '#7A93AC', fontSize: 12 },
  codeScans: { color: '#22c55e', fontSize: 14, fontWeight: '700', marginTop: 2 },
  codeUrl: { color: '#5b7089', fontSize: 11, marginTop: 2 },
  codeActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 },
  codeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  codeBtnText: { color: '#29B6F6', fontSize: 13, fontWeight: '600' },
})
