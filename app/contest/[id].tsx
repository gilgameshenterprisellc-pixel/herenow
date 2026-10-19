import { useEffect, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator,
  RefreshControl, Modal, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Reanimated, { FadeIn, LinearTransition } from 'react-native-reanimated'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { useContestBoard } from '@/hooks/useContestBoard'
import { joinContest, leaveContest, type ContestBoard } from '@/lib/contests'
import {
  formatScore, linePositionLabel, ordinal, statusLabel, textOn, withAlpha,
} from '@/lib/contestFormat'
import { publicName } from '@/lib/format'
import { platformConfirm } from '@/lib/confirm'
import { successBuzz } from '@/lib/haptics'
import BackButton from '@/components/BackButton'
import { LiveDot } from '@/components/LiveContestCard'

// One screen for every contest. Everything on it (the words, the colors, the
// scoring) comes from the contest row, so a new kind of contest never needs a
// new app build. See supabase/live_contests.sql.

const MEDALS = ['#F5C542', '#C9D3E0', '#D08A4E']
// Apple Guideline 5.3.2: official rules must say Apple isn't involved.
const APPLE_DISCLAIMER =
  'Apple is not a sponsor of this contest and is not involved with it in any way.'

export default function ContestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const { board, loading, gone, error, refresh } = useContestBoard(id)
  const [tab, setTab] = useState<'board' | 'line'>('board')
  const [rulesOpen, setRulesOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [myName, setMyName] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
      setMyName(publicName(data?.display_name))
    })()
  }, [])

  // A buzz the moment you're called up, wherever you are on the screen.
  const wasUp = useRef(false)
  useEffect(() => {
    const up = board?.me?.status === 'up'
    if (up && !wasUp.current) successBuzz()
    wasUp.current = up
  }, [board?.me?.status])

  const goBack = () => {
    if (router.canGoBack()) router.back()
    else if (board?.contest.zone_id) router.replace(`/zone/${board.contest.zone_id}` as any)
    else router.replace('/(tabs)/' as any)
  }

  if (loading && !board) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#29B6F6" />
      </View>
    )
  }

  if (gone || !board) {
    return (
      <View style={[styles.container, styles.center, { paddingHorizontal: 32 }]}>
        <View style={[styles.backFloat, { top: insets.top + 8 }]}><BackButton onPress={goBack} /></View>
        <Ionicons name="trophy-outline" size={40} color="#4A6580" />
        <Text style={styles.goneTitle}>This contest isn't available</Text>
        <Text style={styles.goneBody}>It may have been taken down by the host.</Text>
      </View>
    )
  }

  const c = board.contest
  const accent = c.accent_color
  const onAccent = textOn(accent)
  const fmt = (v: number | null) => formatScore(v, c.score_decimals, c.score_suffix)
  const running = c.status === 'live'

  const onJoin = async () => {
    if (busy) return
    setBusy(true)
    const res = await joinContest(c.id, c.zone_id)
    setBusy(false)
    if (!res.ok) { showToast(res.error ?? 'Could not sign up.', 'error'); return }
    successBuzz()
    showToast("You're in. Watch for your name.", 'success')
    refresh()
  }

  const onLeave = () => {
    platformConfirm(
      'Leave the line?',
      board.me?.attempts_used ? 'Your score stays on the board.' : "You'll lose your spot.",
      async () => {
        setBusy(true)
        const res = await leaveContest(c.id)
        setBusy(false)
        if (!res.ok) { showToast(res.error ?? 'Could not leave.', 'error'); return }
        refresh()
      },
      { confirmText: 'Leave', destructive: true },
    )
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await refresh()
    setRefreshing(false)
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + (board.role ? 110 : 40) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
      >
        {/* Hero */}
        <View style={styles.hero}>
          {c.banner_url ? (
            <Image source={{ uri: c.banner_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: '#07101F' }]} />
              <View style={[styles.heroOrb, { backgroundColor: withAlpha(accent, 0.28), top: -90, right: -60 }]} />
              <View style={[styles.heroOrb, { backgroundColor: withAlpha(accent, 0.14), bottom: -120, left: -80 }]} />
            </>
          )}
          <View style={styles.heroScrim} pointerEvents="none" />
          {/* No gradient library on native, so a few stacked bands melt the
              hero into the page instead of ending on a hard edge. */}
          {Platform.OS !== 'web' ? (
            <View style={styles.heroFade} pointerEvents="none">
              {[0.2, 0.45, 0.7, 0.9].map((o) => (
                <View key={o} style={{ flex: 1, backgroundColor: `rgba(5,10,21,${o})` }} />
              ))}
            </View>
          ) : null}
          <View style={[styles.heroTop, { top: insets.top + 6 }]}>
            <BackButton onPress={goBack} />
            <View style={[styles.statusPill, { borderColor: withAlpha(accent, 0.6), backgroundColor: 'rgba(5,10,21,0.7)' }]}>
              <LiveDot color={accent} still={!running} size={6} />
              <Text style={[styles.statusPillText, { color: accent }]}>{statusLabel(c.status)}</Text>
            </View>
          </View>
          <View style={styles.heroBottom}>
            {(c.presented_by || c.logo_url) ? (
              <View style={styles.presentedRow}>
                {c.logo_url ? <Image source={{ uri: c.logo_url }} style={styles.presentedLogo} resizeMode="contain" /> : null}
                {c.presented_by ? (
                  <Text style={styles.presentedText} numberOfLines={1}>PRESENTED BY {c.presented_by.toUpperCase()}</Text>
                ) : null}
              </View>
            ) : null}
            <Text style={styles.heroTitle}>{c.title}</Text>
            {c.tagline ? <Text style={styles.heroTagline}>{c.tagline}</Text> : null}
            <Text style={styles.heroMeta}>
              {[c.zone_name, c.entry_count ? `${c.entry_count} signed up` : null].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>

        {error ? (
          <View style={styles.staleBar}>
            <Ionicons name="cloud-offline-outline" size={14} color="#F5B700" />
            <Text style={styles.staleText}>Reconnecting. The board may be a few seconds behind.</Text>
          </View>
        ) : null}

        {!c.venue_approved && board.role ? (
          <View style={styles.noticeBar}>
            <Ionicons name="time-outline" size={14} color="#F5B700" />
            <Text style={styles.noticeText}>Waiting for the venue to approve. Only you and your operators can see this.</Text>
          </View>
        ) : null}

        {c.ticker ? (
          <Reanimated.View entering={FadeIn} style={[styles.ticker, { borderLeftColor: accent }]}>
            <Ionicons name="megaphone" size={15} color={accent} />
            <Text style={styles.tickerText}>{c.ticker}</Text>
          </Reanimated.View>
        ) : null}

        {board.now_up ? (
          <Reanimated.View entering={FadeIn} layout={LinearTransition}
            style={[styles.nowUp, { borderColor: withAlpha(accent, 0.5), backgroundColor: withAlpha(accent, 0.08) }]}>
            <Text style={[styles.nowUpLabel, { color: accent }]}>UP NOW</Text>
            <Text style={styles.nowUpName} numberOfLines={1}>
              {board.now_up.is_me ? 'You' : (board.now_up.name ?? 'Hidden')}
            </Text>
            {c.attempts_per_entry > 1 ? (
              <Text style={styles.nowUpSub}>Attempt {board.now_up.attempts_used + 1} of {c.attempts_per_entry}</Text>
            ) : null}
          </Reanimated.View>
        ) : null}

        <MyPanel
          board={board}
          myName={myName}
          busy={busy}
          accent={accent}
          onAccent={onAccent}
          fmt={fmt}
          onJoin={onJoin}
          onLeave={onLeave}
        />

        {board.can_view ? (
          <>
            <View style={styles.segment}>
              {([['board', `Leaderboard`], ['line', `Line${board.line.length ? ` · ${board.line.length}` : ''}`]] as const).map(([k, label]) => (
                <TouchableOpacity
                  key={k}
                  style={[styles.segmentItem, tab === k && { backgroundColor: withAlpha(accent, 0.16), borderColor: withAlpha(accent, 0.5) }]}
                  onPress={() => setTab(k)}
                >
                  <Text style={[styles.segmentText, tab === k && { color: accent }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {tab === 'board' ? (
              <View style={styles.list}>
                {board.leaderboard.length === 0 ? (
                  <Text style={styles.empty}>No scores yet. The first one up sets the bar.</Text>
                ) : board.leaderboard.map((r) => (
                  <Reanimated.View key={r.entry_id} layout={LinearTransition.duration(280)} entering={FadeIn}
                    style={[styles.row, r.is_me && { borderColor: withAlpha(accent, 0.6), backgroundColor: withAlpha(accent, 0.08) }]}>
                    <View style={[styles.rank, r.rank <= 3 && { backgroundColor: MEDALS[r.rank - 1] }]}>
                      <Text style={[styles.rankText, r.rank <= 3 && { color: '#050A15' }]}>{r.rank}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {r.is_me ? `${r.name ?? 'You'} (you)` : (r.name ?? 'Hidden')}
                      </Text>
                      {c.attempts_per_entry > 1 ? (
                        <Text style={styles.rowSub}>{r.attempts_used} of {c.attempts_per_entry} attempts</Text>
                      ) : null}
                    </View>
                    <Text style={[styles.score, r.rank === 1 && { color: accent }]}>{fmt(r.best_score)}</Text>
                  </Reanimated.View>
                ))}
              </View>
            ) : (
              <View style={styles.list}>
                {board.line.length === 0 ? (
                  <Text style={styles.empty}>{c.signups_open ? 'Nobody in line. Be first.' : 'Nobody in line.'}</Text>
                ) : board.line.map((l) => (
                  <Reanimated.View key={l.entry_id} layout={LinearTransition.duration(280)} entering={FadeIn}
                    style={[styles.row, l.is_me && { borderColor: withAlpha(accent, 0.6), backgroundColor: withAlpha(accent, 0.08) }]}>
                    <View style={[styles.rank, l.status === 'up' && { backgroundColor: accent }]}>
                      {l.status === 'up'
                        ? <Ionicons name="flash" size={14} color={onAccent} />
                        : <Text style={styles.rankText}>{l.position}</Text>}
                    </View>
                    <Text style={[styles.rowName, { flex: 1 }]} numberOfLines={1}>
                      {l.is_me ? 'You' : (l.name ?? 'Hidden')}
                    </Text>
                    {l.status === 'up' ? <Text style={[styles.upChip, { color: accent }]}>UP NOW</Text> : null}
                  </Reanimated.View>
                ))}
              </View>
            )}
          </>
        ) : null}

        <TouchableOpacity style={styles.rulesBtn} onPress={() => setRulesOpen(true)}>
          <Ionicons name="document-text-outline" size={16} color="#8EADC7" />
          <Text style={styles.rulesBtnText}>{c.prizes ? 'Prizes and official rules' : 'Official rules'}</Text>
          <Ionicons name="chevron-forward" size={16} color="#4A6580" />
        </TouchableOpacity>
      </ScrollView>

      {board.role ? (
        <View style={[styles.opsBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity
            style={[styles.opsPrimary, { backgroundColor: accent }]}
            onPress={() => router.push(`/contest/run/${c.id}` as any)}
          >
            <Ionicons name="pulse" size={18} color={onAccent} />
            <Text style={[styles.opsPrimaryText, { color: onAccent }]}>Run contest</Text>
          </TouchableOpacity>
          {board.role === 'manager' ? (
            <TouchableOpacity style={styles.opsSecondary} onPress={() => router.push(`/contest/edit?id=${c.id}` as any)}>
              <Ionicons name="create-outline" size={18} color="#F8FAFC" />
              <Text style={styles.opsSecondaryText}>Edit</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <Modal visible={rulesOpen} transparent animationType="slide" onRequestClose={() => setRulesOpen(false)}>
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setRulesOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            <View style={styles.sheetHandle} />
            <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 14 }}>
              <Text style={styles.sheetTitle}>{c.title}</Text>
              {c.prizes ? (
                <View style={{ gap: 6 }}>
                  <Text style={styles.sheetLabel}>PRIZES</Text>
                  <Text style={styles.sheetBody}>{c.prizes}</Text>
                </View>
              ) : null}
              <View style={{ gap: 6 }}>
                <Text style={styles.sheetLabel}>HOW IT'S SCORED</Text>
                <Text style={styles.sheetBody}>
                  {c.higher_wins ? 'Highest' : 'Lowest'} {c.score_label.toLowerCase()} wins.
                  {c.attempts_per_entry > 1 ? ` Everyone gets ${c.attempts_per_entry} attempts and their best one counts.` : ' One attempt each.'}
                  {' '}Ties go to whoever got there first.
                </Text>
              </View>
              <View style={{ gap: 6 }}>
                <Text style={styles.sheetLabel}>OFFICIAL RULES</Text>
                <Text style={styles.sheetBody}>
                  {c.rules || 'Sign up while checked in at the venue. The host calls people up in the order they signed up. The host may skip anyone who is not there when called, and may remove anyone at their discretion.'}
                </Text>
              </View>
              <View style={styles.disclaimer}>
                <Text style={styles.disclaimerText}>
                  Run on HereNow{c.zone_name ? ` at ${c.zone_name}` : ''}{c.presented_by ? `, presented by ${c.presented_by}` : ''}. Free to enter; no purchase necessary. {APPLE_DISCLAIMER}
                </Text>
              </View>
            </ScrollView>
            <TouchableOpacity style={styles.sheetClose} onPress={() => setRulesOpen(false)}>
              <Text style={styles.sheetCloseText}>Close</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

// What you can do, and where you stand. One card, whatever your state.
function MyPanel({ board, myName, busy, accent, onAccent, fmt, onJoin, onLeave }: {
  board: ContestBoard
  myName: string | null
  busy: boolean
  accent: string
  onAccent: string
  fmt: (v: number | null) => string
  onJoin: () => void
  onLeave: () => void
}) {
  const c = board.contest
  const me = board.me
  const acceptingStates = c.status === 'scheduled' || c.status === 'live' || c.status === 'paused'

  if (!board.checked_in && !board.role) {
    return (
      <View style={styles.panel}>
        <Ionicons name="location-outline" size={22} color={accent} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.panelTitle}>Check in to play</Text>
          <Text style={styles.panelBody}>
            Signing up and the leaderboard are for people at {c.zone_name ?? 'the venue'}.
          </Text>
        </View>
        {acceptingStates ? (
          <TouchableOpacity style={[styles.smallBtn, { backgroundColor: accent }]}
            onPress={() => router.push(`/check-in/${c.zone_id}` as any)}>
            <Text style={[styles.smallBtnText, { color: onAccent }]}>Check in</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    )
  }

  if (me && me.status === 'up') {
    return (
      <View style={[styles.panel, styles.panelHot, { backgroundColor: accent }]}>
        <Ionicons name="flash" size={26} color={onAccent} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.panelTitleBig, { color: onAccent }]}>You're up!</Text>
          <Text style={[styles.panelBody, { color: onAccent, opacity: 0.85 }]}>Head over now.</Text>
        </View>
      </View>
    )
  }

  if (me && me.status === 'waiting') {
    return (
      <View style={[styles.panel, { borderColor: withAlpha(accent, 0.45) }]}>
        <Text style={[styles.bigNumber, { color: accent }]}>{me.position ?? '·'}</Text>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.panelTitle}>{linePositionLabel(me.position)}</Text>
          <Text style={styles.panelBody}>
            {me.best_score !== null
              ? `Best so far ${fmt(me.best_score)}${me.rank ? `, ${ordinal(me.rank)} place` : ''}. You'll get a notification when you're up.`
              : "You'll get a notification when you're up."}
          </Text>
        </View>
        <TouchableOpacity onPress={onLeave} disabled={busy} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.leaveText}>Leave</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (me && me.status === 'done') {
    return (
      <View style={[styles.panel, { borderColor: withAlpha(accent, 0.45) }]}>
        <Ionicons name="ribbon" size={24} color={accent} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.panelTitle}>
            {me.best_score !== null ? `Your best: ${fmt(me.best_score)}` : "You're done"}
          </Text>
          <Text style={styles.panelBody}>
            {me.rank ? `${ordinal(me.rank)} place ${c.status === 'ended' ? 'final' : 'right now'}.` : 'Thanks for playing.'}
          </Text>
        </View>
      </View>
    )
  }

  if (me && me.status === 'no_show') {
    return (
      <View style={styles.panel}>
        <Ionicons name="alert-circle-outline" size={22} color="#F5B700" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.panelTitle}>You were skipped</Text>
          <Text style={styles.panelBody}>You weren't there when called. Find the host to get back in line.</Text>
        </View>
      </View>
    )
  }

  if (me && me.status === 'removed') {
    return (
      <View style={styles.panel}>
        <Ionicons name="close-circle-outline" size={22} color="#F43F5E" />
        <Text style={[styles.panelBody, { flex: 1 }]}>The host removed you from this contest.</Text>
      </View>
    )
  }

  // Not in it yet (or left).
  if (!acceptingStates) {
    return c.status === 'ended' ? null : (
      <View style={styles.panel}>
        <Text style={[styles.panelBody, { flex: 1 }]}>Signups aren't open.</Text>
      </View>
    )
  }
  const full = c.max_entries !== null && c.entry_count >= c.max_entries
  if (!c.signups_open || full) {
    return (
      <View style={styles.panel}>
        <Ionicons name={full ? 'people' : 'lock-closed-outline'} size={20} color="#8EADC7" />
        <Text style={[styles.panelBody, { flex: 1 }]}>
          {full ? 'This contest is full.' : 'Signups open soon. Stay checked in.'}
        </Text>
      </View>
    )
  }
  if (!board.checked_in) {
    // An operator who isn't checked in sees the board but can't enter.
    return null
  }
  return (
    <View style={styles.joinWrap}>
      <TouchableOpacity
        style={[styles.joinBtn, { backgroundColor: accent, shadowColor: accent }, busy && { opacity: 0.6 }]}
        onPress={onJoin}
        disabled={busy}
        accessibilityRole="button"
      >
        {busy
          ? <ActivityIndicator color={onAccent} />
          : <Text style={[styles.joinText, { color: onAccent }]}>Sign me up</Text>}
      </TouchableOpacity>
      <Text style={styles.joinNote}>
        You'll show as {myName ?? 'your first name and last initial'} on the leaderboard
        {c.max_entries ? ` · ${Math.max(0, c.max_entries - c.entry_count)} spots left` : ''}.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  backFloat: { position: 'absolute', left: 12 },
  goneTitle: { fontSize: 18, fontWeight: '800', color: '#F8FAFC', textAlign: 'center' },
  goneBody: { fontSize: 14, color: '#7A93AC', textAlign: 'center' },

  hero: { minHeight: 300, justifyContent: 'flex-end', overflow: 'hidden' },
  heroOrb: { position: 'absolute', width: 320, height: 320, borderRadius: 160 },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5,10,21,0.45)',
    ...Platform.select({
      web: { backgroundImage: 'linear-gradient(180deg, rgba(5,10,21,0.15) 0%, rgba(5,10,21,0.55) 55%, #050A15 100%)', backgroundColor: 'transparent' } as any,
      default: {},
    }),
  },
  heroFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 120 },
  heroTop: {
    position: 'absolute', left: 12, right: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingLeft: 6, paddingRight: 12, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
  },
  statusPillText: { fontSize: 12, fontWeight: '900', letterSpacing: 1.4 },
  heroBottom: { paddingHorizontal: 20, paddingTop: 110, paddingBottom: 20, gap: 6 },
  presentedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  presentedLogo: { width: 28, height: 28, borderRadius: 6 },
  presentedText: { fontSize: 11, fontWeight: '800', color: '#CBD5E1', letterSpacing: 1.6, flexShrink: 1 },
  heroTitle: { fontSize: 32, lineHeight: 36, fontWeight: '900', color: '#F8FAFC', letterSpacing: -0.5 },
  heroTagline: { fontSize: 15, color: '#CBD5E1', lineHeight: 21 },
  heroMeta: { fontSize: 12, color: '#8EADC7', fontWeight: '600', marginTop: 2 },

  staleBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 8, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, backgroundColor: '#F5B70014',
  },
  staleText: { fontSize: 12, color: '#F5B700', flex: 1 },
  noticeBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 8, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 10, backgroundColor: '#F5B70014', borderWidth: 1, borderColor: '#F5B70040',
  },
  noticeText: { fontSize: 12, color: '#F5B700', flex: 1, lineHeight: 17 },

  ticker: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 12, backgroundColor: '#0D1B2E', borderLeftWidth: 3,
  },
  tickerText: { flex: 1, fontSize: 14, color: '#F8FAFC', fontWeight: '600', lineHeight: 19 },

  nowUp: {
    marginHorizontal: 16, marginTop: 12, paddingVertical: 18, paddingHorizontal: 18,
    borderRadius: 18, borderWidth: 1, alignItems: 'center', gap: 4,
  },
  nowUpLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  nowUpName: { fontSize: 30, fontWeight: '900', color: '#F8FAFC', letterSpacing: -0.5 },
  nowUpSub: { fontSize: 12, color: '#8EADC7', fontWeight: '600' },

  panel: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginTop: 12, padding: 16,
    borderRadius: 16, backgroundColor: '#0D1B2E', borderWidth: 1, borderColor: '#1A2E4A',
  },
  panelHot: { borderWidth: 0, paddingVertical: 20 },
  panelTitle: { fontSize: 16, fontWeight: '800', color: '#F8FAFC' },
  panelTitleBig: { fontSize: 24, fontWeight: '900' },
  panelBody: { fontSize: 13, color: '#8EADC7', lineHeight: 18 },
  bigNumber: { fontSize: 40, fontWeight: '900', minWidth: 44, textAlign: 'center', fontVariant: ['tabular-nums'] },
  leaveText: { fontSize: 13, color: '#7A93AC', fontWeight: '700' },
  smallBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, minHeight: 40, justifyContent: 'center' },
  smallBtnText: { fontSize: 13, fontWeight: '800' },

  joinWrap: { marginHorizontal: 16, marginTop: 14, gap: 8 },
  joinBtn: {
    height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  joinText: { fontSize: 17, fontWeight: '900', letterSpacing: 0.3 },
  joinNote: { fontSize: 12, color: '#7A93AC', textAlign: 'center', lineHeight: 17 },

  segment: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 20 },
  segmentItem: {
    flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
    borderWidth: 1, borderColor: '#1A2E4A', backgroundColor: '#07101F', minHeight: 44, justifyContent: 'center',
  },
  segmentText: { fontSize: 14, fontWeight: '800', color: '#7A93AC' },

  list: { marginHorizontal: 16, marginTop: 10, gap: 8 },
  empty: { fontSize: 14, color: '#7A93AC', textAlign: 'center', paddingVertical: 28 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14,
    backgroundColor: '#0D1B2E', borderWidth: 1, borderColor: '#1A2E4A', minHeight: 56,
  },
  rank: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1A2E4A',
  },
  rankText: { fontSize: 14, fontWeight: '900', color: '#F8FAFC', fontVariant: ['tabular-nums'] },
  rowName: { fontSize: 15, fontWeight: '700', color: '#F8FAFC' },
  rowSub: { fontSize: 11, color: '#7A93AC', marginTop: 1 },
  score: { fontSize: 20, fontWeight: '900', color: '#F8FAFC', fontVariant: ['tabular-nums'] },
  upChip: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },

  rulesBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 20, paddingVertical: 14, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1, borderColor: '#1A2E4A', minHeight: 48,
  },
  rulesBtnText: { flex: 1, fontSize: 14, color: '#CBD5E1', fontWeight: '600' },

  opsBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: 'rgba(5,10,21,0.96)', borderTopWidth: 1, borderTopColor: '#0D1B2E',
  },
  opsPrimary: {
    flex: 1, height: 50, borderRadius: 14, flexDirection: 'row', gap: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  opsPrimaryText: { fontSize: 15, fontWeight: '900' },
  opsSecondary: {
    height: 50, paddingHorizontal: 18, borderRadius: 14, flexDirection: 'row', gap: 6,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#0D1B2E',
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  opsSecondaryText: { fontSize: 15, fontWeight: '800', color: '#F8FAFC' },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0A1424', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 10, gap: 14,
    ...Platform.select({ web: { maxWidth: 640, width: '100%', alignSelf: 'center' } as any, default: {} }),
  },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#1A2E4A', marginBottom: 6 },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: '#F8FAFC' },
  sheetLabel: { fontSize: 11, fontWeight: '800', color: '#7A93AC', letterSpacing: 1.2 },
  sheetBody: { fontSize: 14, color: '#CBD5E1', lineHeight: 21 },
  disclaimer: { padding: 12, borderRadius: 10, backgroundColor: '#07101F' },
  disclaimerText: { fontSize: 12, color: '#7A93AC', lineHeight: 18 },
  sheetClose: {
    height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0D1B2E', borderWidth: 1, borderColor: '#1A2E4A',
  },
  sheetCloseText: { fontSize: 15, fontWeight: '800', color: '#F8FAFC' },
})
