import { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Platform, RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { getAuthedUser } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { platformConfirm } from '@/lib/confirm'
import { screenText, blockedMessage } from '@/lib/textModeration'
import BackButton from '@/components/BackButton'
import { formatDateTime } from '@/components/DateTimeField'
import {
  fetchPartner, fetchPartnerStats, fetchPartnerBroadcasts, sendPartnerBroadcast,
  deletePartnerBroadcast, revokePartner,
  type VenuePartner, type PartnerStats, type PartnerBroadcast,
} from '@/lib/partners'
import { partnerStatus, PARTNER_STATUS_LABEL } from '@/lib/partnerStatus'

// One partnership, seen by the partner (broadcast, host, numbers) and by the
// venue (numbers, end it). Jacob, Oct 29: partners "have admin roles like
// broadcast and get analytics while they have permissions".
export default function PartnerScreen() {
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const { id } = useLocalSearchParams<{ id: string }>()
  const [partner, setPartner] = useState<VenuePartner | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [stats, setStats] = useState<PartnerStats | null>(null)
  const [broadcasts, setBroadcasts] = useState<PartnerBroadcast[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    const user = await getAuthedUser()
    if (!user) { router.replace('/(auth)/login'); return }
    setUserId(user.id)
    const p = await fetchPartner(id)
    setPartner(p)
    if (p) {
      const [s, b] = await Promise.all([fetchPartnerStats(p.id), fetchPartnerBroadcasts(p.id)])
      setStats(s)
      setBroadcasts(b)
    }
    setLoading(false)
    setRefreshing(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const isPartner = !!partner && partner.organizations?.owner_id === userId
  const isVenue = !!partner && partner.zones?.owner_id === userId
  const status = partner ? partnerStatus(partner) : 'ended'
  const open = status === 'live' || status === 'upcoming'

  const handleSend = async () => {
    if (!partner || !message.trim()) return
    const screen = screenText(message)
    if (!screen.ok) { showToast(blockedMessage(screen.category), 'error'); return }
    setSending(true)
    const res = await sendPartnerBroadcast(partner, message)
    setSending(false)
    if (!res.ok || !res.row) {
      showToast('Could not send. The partnership may have ended.', 'error')
      return
    }
    setBroadcasts((prev) => [res.row!, ...prev])
    setMessage('')
    showToast(`Sent to everyone checked in at ${partner.zones?.name ?? 'the venue'}.`, 'success')
  }

  const handleDelete = (b: PartnerBroadcast) => {
    platformConfirm('Delete this broadcast?', 'Guests will stop seeing it.', async () => {
      const ok = await deletePartnerBroadcast(b.id)
      if (ok) setBroadcasts((prev) => prev.filter((x) => x.id !== b.id))
      else showToast('Could not delete. Try again.', 'error')
    }, { confirmText: 'Delete', destructive: true })
  }

  const handleRevoke = () => {
    if (!partner) return
    platformConfirm(
      `End the ${partner.organizations?.name ?? ''} partnership now?`,
      'They lose broadcast, hosting and stats access right away.',
      async () => {
        const ok = await revokePartner(partner.id)
        if (ok) setPartner({ ...partner, revoked_at: new Date().toISOString() })
        else showToast('Could not end it. Try again.', 'error')
      },
      { confirmText: 'End partnership', destructive: true },
    )
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <BackButton />
        <Text style={styles.title}>Partnership</Text>
      </View>

      <ScrollView
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
        contentContainerStyle={[styles.content, webCenter]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#29B6F6" />}
      >
        {loading ? <ActivityIndicator color="#29B6F6" style={{ marginTop: 40 }} /> : !partner ? (
          <Text style={styles.hint}>This partnership isn't available to you.</Text>
        ) : (
          <>
            <View style={[styles.card, status === 'live' && styles.cardLive]}>
              <View style={styles.row}>
                <Text style={styles.orgName}>{partner.organizations?.name ?? 'Organization'}</Text>
                <Text style={[styles.status, status === 'live' && { color: '#22c55e' }]}>{PARTNER_STATUS_LABEL[status]}</Text>
              </View>
              <TouchableOpacity onPress={() => router.push(`/zone/${partner.zone_id}` as any)}>
                <Text style={styles.venue}>at {partner.zones?.name ?? 'the venue'} →</Text>
              </TouchableOpacity>
              {partner.label ? <Text style={styles.label}>{partner.label}</Text> : null}
              <Text style={styles.small}>
                {formatDateTime(new Date(partner.starts_at))} to {formatDateTime(new Date(partner.ends_at))}
              </Text>
              {isVenue && open && (
                <TouchableOpacity style={styles.endBtn} onPress={handleRevoke}>
                  <Text style={styles.endBtnText}>End partnership now</Text>
                </TouchableOpacity>
              )}
            </View>

            {stats && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>THE NUMBERS</Text>
                <View style={styles.statsGrid}>
                  {status === 'live' && <Stat n={stats.here_now} label="Here right now" />}
                  <Stat n={stats.guests} label="Guests during the window" />
                  <Stat n={stats.check_ins} label="Check-ins" />
                  <Stat n={stats.first_visits} label="First visit here" hint="Never checked in here before" />
                  <Stat n={stats.new_to_herenow} label="New to HereNow" hint="Joined HereNow and checked in here" />
                  <Stat n={stats.new_followers} label="New venue followers" />
                  <Stat n={stats.broadcast_reach} label={`Saw a broadcast (${stats.broadcasts} sent)`} />
                  <Stat n={stats.contest_entries} label="Contest entries" />
                  <Stat
                    n={stats.org_joins ?? stats.new_members}
                    label={`Joined ${partner.organizations?.name ?? 'the organization'} on HereNow`}
                  />
                </View>
                <Text style={styles.small}>
                  Totals for the partnership window only. HereNow never shows who.
                </Text>
              </View>
            )}

            {isPartner && partner.can_broadcast && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>BROADCAST TO GUESTS</Text>
                {status === 'live' ? (
                  <>
                    <Text style={styles.small}>
                      Everyone checked in at {partner.zones?.name ?? 'the venue'} sees this in Updates and the Pulse, until they leave.
                    </Text>
                    <TextInput
                      style={[styles.input, styles.multiline]}
                      value={message}
                      onChangeText={setMessage}
                      placeholder="e.g. Bull riding starts at 10. Sign up in the Contests card."
                      placeholderTextColor="#4A6580"
                      multiline
                      maxLength={300}
                    />
                    <Text style={styles.count}>{message.length}/300</Text>
                    <TouchableOpacity
                      style={[styles.primaryBtn, (!message.trim() || sending) && styles.disabled]}
                      onPress={handleSend}
                      disabled={!message.trim() || sending}
                    >
                      {sending ? <ActivityIndicator color="#050A15" size="small" /> : <Text style={styles.primaryBtnText}>Send to guests</Text>}
                    </TouchableOpacity>
                  </>
                ) : (
                  <Text style={styles.small}>
                    {status === 'upcoming' ? 'You can broadcast once it starts.' : 'Broadcasting ended with the partnership.'}
                  </Text>
                )}
              </View>
            )}

            {isPartner && partner.can_host && open && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>HOST AT {(partner.zones?.name ?? 'the venue').toUpperCase()}</Text>
                <Text style={styles.small}>Already approved by the venue. You can set these up before the start.</Text>
                <View style={styles.row}>
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={() => router.push(`/contest/edit?orgId=${partner.org_id}&zoneId=${partner.zone_id}` as any)}
                  >
                    <Ionicons name="trophy-outline" size={16} color="#29B6F6" />
                    <Text style={styles.secondaryBtnText}>Run a contest</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={() => router.push(`/zone/event/create?zoneId=${partner.zone_id}&orgId=${partner.org_id}` as any)}
                  >
                    <Ionicons name="calendar-outline" size={16} color="#29B6F6" />
                    <Text style={styles.secondaryBtnText}>Add an event</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {broadcasts.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>SENT</Text>
                {broadcasts.map((b) => (
                  <View key={b.id} style={styles.sent}>
                    <View style={styles.row}>
                      <Text style={[styles.small, { flex: 1 }]}>{formatDateTime(new Date(b.created_at))}</Text>
                      {(isPartner || isVenue) && (
                        <TouchableOpacity onPress={() => handleDelete(b)} hitSlop={10}>
                          <Text style={styles.small}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <Text style={styles.sentText}>{b.message}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  )
}

// A number the database didn't return (its SQL hasn't run yet) is left out
// rather than shown as 0.
function Stat({ n, label, hint }: { n: number | undefined; label: string; hint?: string }) {
  if (n === undefined || n === null) return null
  return (
    <View style={styles.stat}>
      <Text style={styles.statNum}>{n}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  )
}

const webCenter = Platform.select({
  web: { maxWidth: 600, alignSelf: 'center' as const, width: '100%' as any } as any,
  default: {},
})

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#0D1B2E',
  },
  title:   { fontSize: 18, fontWeight: '800', color: '#f8fafc', flex: 1 },
  scroll:  { flex: 1 },
  content: { padding: 16, gap: 20, paddingBottom: 60 },
  hint:    { fontSize: 13, color: '#7A93AC', lineHeight: 19 },
  small:   { fontSize: 12, color: '#7A93AC', lineHeight: 17 },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  section: { gap: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#7A93AC', textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: '#0D1B2E', borderRadius: 14, padding: 16, gap: 6, borderWidth: 1, borderColor: '#1A2E4A' },
  cardLive: { borderColor: '#22c55e66' },
  orgName: { flex: 1, fontSize: 20, fontWeight: '900', color: '#f8fafc' },
  status:  { fontSize: 12, fontWeight: '800', color: '#7A93AC' },
  venue:   { fontSize: 14, fontWeight: '700', color: '#29B6F6' },
  label:   { fontSize: 14, fontWeight: '600', color: '#D0E8F5' },
  endBtn:  { marginTop: 8, alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center' },
  endBtnText: { fontSize: 13, fontWeight: '700', color: '#ef4444' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: {
    flexGrow: 1, minWidth: '45%', backgroundColor: '#0D1B2E', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#1A2E4A', gap: 4,
  },
  statNum:   { fontSize: 24, fontWeight: '900', color: '#f8fafc' },
  statLabel: { fontSize: 12, color: '#7A93AC' },
  statHint:  { fontSize: 11, color: '#4A6580', lineHeight: 15 },
  input: {
    backgroundColor: '#0D1B2E', borderRadius: 10, padding: 12,
    color: '#f8fafc', fontSize: 14, borderWidth: 1, borderColor: '#1A2E4A',
  },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  count: { fontSize: 11, color: '#4A6580', textAlign: 'right' },
  primaryBtn: { backgroundColor: '#29B6F6', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: '#050A15' },
  disabled: { opacity: 0.4 },
  secondaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: '#1A2E4A', backgroundColor: '#07101F',
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '700', color: '#29B6F6' },
  sent: { backgroundColor: '#0D1B2E', borderRadius: 12, padding: 12, gap: 4, borderWidth: 1, borderColor: '#1A2E4A' },
  sentText: { fontSize: 14, color: '#D0E8F5', lineHeight: 20 },
})
