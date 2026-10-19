import { useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator,
  Switch, Modal, Platform, KeyboardAvoidingView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useToast } from '@/contexts/ToastContext'
import { useContestBoard } from '@/hooks/useContestBoard'
import {
  approveContest, callUp, editAttempt, recordScore, setContestStatus, setEntryStatus,
  setSignupsOpen, setTicker, voidAttempt, type ContestAttempt,
} from '@/lib/contests'
import {
  formatScore, parseScoreInput, statusLabel, textOn, withAlpha, type ContestStatus,
} from '@/lib/contestFormat'
import { screenText, blockedMessage } from '@/lib/textModeration'
import { platformConfirm } from '@/lib/confirm'
import { successBuzz, tapFeedback } from '@/lib/haptics'
import BackButton from '@/components/BackButton'
import ActionSheet, { type ActionSheetConfig } from '@/components/ActionSheet'
import { LiveDot } from '@/components/LiveContestCard'

// The operator console: run a contest live from a phone or a laptop. Big
// targets, one action per tap, and every action reloads the board right away
// rather than waiting on Realtime.

const STEPS: { status: ContestStatus; label: string }[] = [
  { status: 'scheduled', label: 'Upcoming' },
  { status: 'live',      label: 'Live' },
  { status: 'paused',    label: 'Paused' },
  { status: 'ended',     label: 'Ended' },
]

export default function RunContestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const { board, loading, gone, error, refresh } = useContestBoard(id)
  const [busy, setBusy] = useState<string | null>(null)
  const [scoreText, setScoreText] = useState('')
  const [tickerText, setTickerText] = useState<string | null>(null)
  const [sheet, setSheet] = useState<ActionSheetConfig | null>(null)
  const [fixing, setFixing] = useState<ContestAttempt | null>(null)
  const [fixText, setFixText] = useState('')

  const attemptsByEntry = useMemo(() => {
    const m = new Map<string, ContestAttempt[]>()
    for (const a of board?.ops?.attempts ?? []) {
      const list = m.get(a.entry_id) ?? []
      list.push(a)
      m.set(a.entry_id, list)
    }
    return m
  }, [board?.ops?.attempts])

  const goBack = () => {
    if (router.canGoBack()) router.back()
    else router.replace(`/contest/${id}` as any)
  }

  if (loading && !board) {
    return <View style={[styles.container, styles.center]}><ActivityIndicator color="#29B6F6" /></View>
  }
  if (gone || !board || !board.role) {
    return (
      <View style={[styles.container, styles.center, { paddingHorizontal: 32 }]}>
        <View style={{ position: 'absolute', left: 12, top: insets.top + 8 }}><BackButton onPress={goBack} /></View>
        <Ionicons name="lock-closed-outline" size={36} color="#4A6580" />
        <Text style={styles.goneTitle}>You're not running this contest</Text>
        <Text style={styles.goneBody}>Ask the host to add your username as an operator.</Text>
      </View>
    )
  }

  const c = board.contest
  const accent = c.accent_color
  const onAccent = textOn(accent)
  const fmt = (v: number | null) => formatScore(v, c.score_decimals, c.score_suffix)
  const nextUp = board.line.find((l) => l.status === 'waiting')
  const nowUp = board.now_up

  // Every action: one flag so a double tap can't fire it twice, a toast on
  // failure, and a reload on success.
  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) => {
    if (busy) return false
    setBusy(key)
    const res = await fn()
    setBusy(null)
    if (!res.ok) { showToast(res.error ?? "That didn't go through. Try again.", 'error'); return false }
    if (okMsg) showToast(okMsg, 'success')
    refresh()
    return true
  }

  const parsed = parseScoreInput(scoreText)
  const preview = parsed === null ? '' : fmt(Number(parsed.toFixed(c.score_decimals)))

  const onRecord = async () => {
    if (!nowUp) return
    if (parsed === null) { showToast("That score doesn't look like a number.", 'error'); return }
    const ok = await run('score', () => recordScore(c.id, nowUp.entry_id, parsed))
    if (ok) {
      successBuzz()
      setScoreText('')
      showToast(`${nowUp.name ?? 'Score'} ${preview} recorded`, 'success')
    }
  }

  const onCall = async (entryId?: string) => {
    if (busy) return
    setBusy('call')
    const res = await callUp(c.id, entryId)
    setBusy(null)
    if (!res.ok) { showToast(res.error ?? 'Could not call anyone up.', 'error'); return }
    tapFeedback()
    if (!res.data?.called) showToast('Nobody left in line.', 'info')
    setScoreText('')
    refresh()
  }

  const onStatus = (status: ContestStatus) => {
    if (status === c.status) return
    if (status === 'ended') {
      platformConfirm('End the contest?', 'Signups close and the final results stay up for a day. You can reopen it.',
        () => run('status', () => setContestStatus(c.id, 'ended'), 'Contest ended'), { confirmText: 'End it' })
      return
    }
    run('status', () => setContestStatus(c.id, status))
  }

  const onHide = () => {
    platformConfirm('Hide this contest from everyone?',
      'It disappears from the venue page and every phone right away. Nothing is deleted, and you can show it again.',
      () => run('status', () => setContestStatus(c.id, 'hidden'), 'Hidden from everyone'),
      { confirmText: 'Hide it', destructive: true })
  }

  const postTicker = async (text: string) => {
    if (text) {
      const s = screenText(text)
      if (!s.ok) { showToast(blockedMessage(s.category), 'error'); return }
    }
    const ok = await run('ticker', () => setTicker(c.id, text), text ? 'Posted to everyone' : 'Taken down')
    if (ok) setTickerText('')
  }

  const lineMenu = (entryId: string, name: string | null) => setSheet({
    title: name ?? 'Entrant',
    options: [
      { label: 'Call up now', onPress: () => onCall(entryId) },
      { label: 'Mark as no-show', onPress: () => run('entry', () => setEntryStatus(entryId, 'no_show')) },
      { label: 'Remove from contest', destructive: true, onPress: () =>
        platformConfirm(`Remove ${name ?? 'this person'}?`, "They drop off the board and can't sign up again.",
          () => run('entry', () => setEntryStatus(entryId, 'removed')), { confirmText: 'Remove', destructive: true }) },
    ],
  })

  const resultMenu = (entryId: string, name: string | null) => {
    const attempts = attemptsByEntry.get(entryId) ?? []
    setSheet({
      title: name ?? 'Entrant',
      message: 'Fix a mistyped score, or void one to give a re-do.',
      options: [
        ...attempts.filter((a) => !a.voided).flatMap((a) => [
          { label: `Fix ${fmt(a.score)}`, onPress: () => { setFixing(a); setFixText(String(a.score)) } },
          { label: `Void ${fmt(a.score)}`, destructive: true, onPress: () =>
            platformConfirm(`Void ${fmt(a.score)}?`, 'It stops counting. If they have no attempts left, they go back in line for a re-do.',
              () => run('attempt', () => voidAttempt(a.id), 'Voided'), { confirmText: 'Void', destructive: true }) },
        ]),
        { label: 'Remove from contest', destructive: true, onPress: () =>
          platformConfirm(`Remove ${name ?? 'this person'}?`, "They drop off the board and can't sign up again.",
            () => run('entry', () => setEntryStatus(entryId, 'removed')), { confirmText: 'Remove', destructive: true }) },
      ],
    })
  }

  const saveFix = async () => {
    if (!fixing) return
    const v = parseScoreInput(fixText)
    if (v === null) { showToast("That score doesn't look like a number.", 'error'); return }
    const ok = await run('attempt', () => editAttempt(fixing.id, v), 'Score fixed')
    if (ok) setFixing(null)
  }

  const hidden = c.status === 'hidden'
  const isDraft = c.status === 'draft'

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <BackButton onPress={goBack} />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerKicker}>RUNNING</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>{c.title}</Text>
        </View>
        <TouchableOpacity style={styles.viewBtn} onPress={() => router.push(`/contest/${c.id}` as any)}>
          <Ionicons name="eye-outline" size={16} color="#CBD5E1" />
          <Text style={styles.viewBtnText}>View</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        {error ? (
          <View style={styles.warn}>
            <Ionicons name="cloud-offline-outline" size={15} color="#F5B700" />
            <Text style={styles.warnText}>Connection is shaky. Actions still go through when they can.</Text>
          </View>
        ) : null}

        {!c.venue_approved ? (
          <View style={styles.warn}>
            <Ionicons name="time-outline" size={15} color="#F5B700" />
            <Text style={styles.warnText}>
              {c.zone_owner_is_me ? 'An organization made this contest at your venue. Approve it to let people see it.'
                : `Waiting for ${c.zone_name ?? 'the venue'} to approve. Nobody else can see it yet.`}
            </Text>
            {c.zone_owner_is_me ? (
              <TouchableOpacity style={[styles.chipBtn, { backgroundColor: '#22C55E' }]}
                onPress={() => run('approve', () => approveContest(c.id, true), 'Approved')}>
                <Text style={[styles.chipBtnText, { color: '#050A15' }]}>Approve</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* Status */}
        {hidden ? (
          <View style={[styles.card, { borderColor: '#F43F5E66' }]}>
            <Text style={styles.cardTitle}>Hidden from everyone</Text>
            <Text style={styles.cardBody}>Only you and the other operators can see it.</Text>
            <TouchableOpacity style={[styles.bigBtn, { backgroundColor: accent }]}
              onPress={() => run('status', () => setContestStatus(c.id, 'paused'), 'Showing again (paused)')}>
              <Text style={[styles.bigBtnText, { color: onAccent }]}>Show it again</Text>
            </TouchableOpacity>
          </View>
        ) : isDraft ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Draft</Text>
            <Text style={styles.cardBody}>Nobody sees it yet. Publish it to put it on {c.zone_name ?? 'the venue'}'s page.</Text>
            <TouchableOpacity style={[styles.bigBtn, { backgroundColor: accent }]}
              onPress={() => run('status', () => setContestStatus(c.id, 'scheduled'), 'Published')}>
              <Text style={[styles.bigBtnText, { color: onAccent }]}>Publish</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <LiveDot color={accent} still={c.status !== 'live'} size={6} />
              <Text style={[styles.cardKicker, { color: accent }]}>{statusLabel(c.status)}</Text>
              <Text style={styles.cardCount}>{c.entry_count} signed up</Text>
            </View>
            <View style={styles.steps}>
              {STEPS.map((s) => {
                const on = c.status === s.status
                return (
                  <TouchableOpacity key={s.status} disabled={!!busy}
                    style={[styles.step, on && { backgroundColor: accent, borderColor: accent }]}
                    onPress={() => onStatus(s.status)}>
                    <Text style={[styles.stepText, on && { color: onAccent }]}>{s.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Signups open</Text>
                <Text style={styles.cardBody}>People checked in can join the line.</Text>
              </View>
              <Switch
                value={c.signups_open}
                onValueChange={(v) => { run('signups', () => setSignupsOpen(c.id, v)) }}
                disabled={c.status === 'ended' || !!busy}
                trackColor={{ true: accent, false: '#1A2E4A' }}
                thumbColor="#F8FAFC"
              />
            </View>
          </View>
        )}

        {/* Up now / call next */}
        {!hidden && !isDraft && c.status !== 'ended' ? (
          nowUp ? (
            <View style={[styles.card, { borderColor: withAlpha(accent, 0.6) }]}>
              <Text style={[styles.cardKicker, { color: accent }]}>UP NOW</Text>
              <Text style={styles.upName}>{nowUp.name ?? 'Entrant'}</Text>
              {c.attempts_per_entry > 1 ? (
                <Text style={styles.cardBody}>Attempt {nowUp.attempts_used + 1} of {c.attempts_per_entry}</Text>
              ) : null}
              <Text style={styles.inputLabel}>{c.score_label}</Text>
              <TextInput
                style={[styles.scoreInput, { borderColor: parsed === null && scoreText ? '#F43F5E' : withAlpha(accent, 0.6) }]}
                value={scoreText}
                onChangeText={setScoreText}
                placeholder={c.score_decimals > 0 ? `0.${'0'.repeat(c.score_decimals)}` : '0'}
                placeholderTextColor="#4A6580"
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={onRecord}
                maxLength={14}
              />
              <Text style={styles.previewText}>{preview ? `Records as ${preview}` : ' '}</Text>
              <TouchableOpacity
                style={[styles.bigBtn, { backgroundColor: accent }, (parsed === null || !!busy) && { opacity: 0.5 }]}
                onPress={onRecord} disabled={parsed === null || !!busy}>
                {busy === 'score' ? <ActivityIndicator color={onAccent} /> :
                  <Text style={[styles.bigBtnText, { color: onAccent }]}>Record score</Text>}
              </TouchableOpacity>
              <View style={styles.row2}>
                <TouchableOpacity style={styles.ghostBtn} disabled={!!busy}
                  onPress={() => run('entry', () => setEntryStatus(nowUp.entry_id, 'no_show'))}>
                  <Text style={styles.ghostBtnText}>No-show</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ghostBtn} disabled={!!busy}
                  onPress={() => run('entry', () => setEntryStatus(nowUp.entry_id, 'waiting'))}>
                  <Text style={styles.ghostBtnText}>Back to line</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.card}>
              <TouchableOpacity
                style={[styles.bigBtn, { backgroundColor: accent }, (!nextUp || !!busy) && { opacity: 0.45 }]}
                onPress={() => onCall()} disabled={!nextUp || !!busy}>
                {busy === 'call' ? <ActivityIndicator color={onAccent} /> : (
                  <Text style={[styles.bigBtnText, { color: onAccent }]}>
                    {nextUp ? `Call up ${nextUp.name ?? 'next'}` : 'Line is empty'}
                  </Text>
                )}
              </TouchableOpacity>
              <Text style={[styles.cardBody, { textAlign: 'center' }]}>
                {nextUp ? "They get a notification, and the person after them is told they're on deck."
                  : c.signups_open ? 'Waiting for signups.' : 'Open signups to let people join.'}
              </Text>
            </View>
          )
        ) : null}

        {/* Ticker */}
        {!hidden ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Announcement</Text>
            <Text style={styles.cardBody}>One line at the top of everyone's screen.</Text>
            {/* What people see right now, so posting has visible proof it worked. */}
            {c.ticker ? (
              <View style={[styles.liveTicker, { borderLeftColor: accent }]}>
                <Text style={[styles.liveTickerLabel, { color: accent }]}>ON SCREENS NOW</Text>
                <Text style={styles.liveTickerText}>{c.ticker}</Text>
              </View>
            ) : (
              <Text style={styles.cardBody}>Nothing posted right now.</Text>
            )}
            <TextInput
              style={styles.input}
              value={tickerText ?? ''}
              onChangeText={setTickerText}
              placeholder={c.ticker ? 'Replace it with something new' : 'Back in 10 minutes'}
              placeholderTextColor="#4A6580"
              maxLength={140}
              returnKeyType="send"
              onSubmitEditing={() => { if ((tickerText ?? '').trim()) postTicker((tickerText ?? '').trim()) }}
            />
            <View style={styles.row2}>
              <TouchableOpacity
                style={[styles.ghostBtn, { borderColor: withAlpha(accent, 0.6) }, (!!busy || !(tickerText ?? '').trim()) && styles.dim]}
                disabled={!!busy || !(tickerText ?? '').trim()}
                onPress={() => postTicker((tickerText ?? '').trim())}>
                <Text style={[styles.ghostBtnText, { color: accent }]}>Post</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ghostBtn, (!!busy || !c.ticker) && styles.dim]}
                disabled={!!busy || !c.ticker}
                onPress={() => postTicker('')}>
                <Text style={styles.ghostBtnText}>Take it down</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* Line */}
        <Text style={styles.section}>LINE · {board.line.filter((l) => l.status === 'waiting').length}</Text>
        {board.line.filter((l) => l.status === 'waiting').length === 0 ? (
          <Text style={styles.empty}>Nobody waiting.</Text>
        ) : board.line.filter((l) => l.status === 'waiting').map((l) => (
          <View key={l.entry_id} style={styles.listRow}>
            <Text style={styles.pos}>{l.position}</Text>
            <Text style={styles.listName} numberOfLines={1}>{l.name ?? 'Entrant'}</Text>
            {c.attempts_per_entry > 1 && l.attempts_used > 0 ? (
              <Text style={styles.listSub}>{l.attempts_used}/{c.attempts_per_entry}</Text>
            ) : null}
            <TouchableOpacity style={[styles.chipBtn, { borderColor: withAlpha(accent, 0.6) }]}
              disabled={!!busy || hidden || isDraft || c.status === 'ended'} onPress={() => onCall(l.entry_id)}>
              <Text style={[styles.chipBtnText, { color: accent }]}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={() => lineMenu(l.entry_id, l.name)}>
              <Ionicons name="ellipsis-horizontal" size={20} color="#8EADC7" />
            </TouchableOpacity>
          </View>
        ))}

        {/* Skipped */}
        {(board.ops?.skipped.length ?? 0) > 0 ? (
          <>
            <Text style={styles.section}>SKIPPED</Text>
            {board.ops!.skipped.map((s) => (
              <View key={s.entry_id} style={styles.listRow}>
                <Text style={[styles.listName, { color: '#8EADC7' }]} numberOfLines={1}>{s.name}</Text>
                <Text style={styles.listSub}>{s.status === 'no_show' ? 'No-show' : 'Removed'}</Text>
                {s.status === 'no_show' ? (
                  <TouchableOpacity style={styles.chipBtn} disabled={!!busy}
                    onPress={() => run('entry', () => setEntryStatus(s.entry_id, 'waiting'), 'Back in line')}>
                    <Text style={styles.chipBtnText}>Back in line</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </>
        ) : null}

        {/* Results */}
        <Text style={styles.section}>RESULTS · tap to fix</Text>
        {board.leaderboard.length === 0 ? (
          <Text style={styles.empty}>No scores yet.</Text>
        ) : board.leaderboard.map((r) => (
          <TouchableOpacity key={r.entry_id} style={styles.listRow} onPress={() => resultMenu(r.entry_id, r.name)}>
            <Text style={styles.pos}>{r.rank}</Text>
            <Text style={styles.listName} numberOfLines={1}>{r.name ?? 'Entrant'}</Text>
            <Text style={[styles.listScore, r.rank === 1 && { color: accent }]}>{fmt(r.best_score)}</Text>
          </TouchableOpacity>
        ))}

        {!hidden ? (
          <TouchableOpacity style={styles.killBtn} onPress={onHide}>
            <Ionicons name="eye-off-outline" size={16} color="#F43F5E" />
            <Text style={styles.killText}>Hide from everyone</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      <ActionSheet config={sheet} onClose={() => setSheet(null)} />

      <Modal visible={!!fixing} transparent animationType="fade" onRequestClose={() => setFixing(null)}>
        <View style={styles.fixBackdrop}>
          <View style={styles.fixCard}>
            <Text style={styles.cardTitle}>Fix score</Text>
            <TextInput
              style={styles.scoreInput}
              value={fixText}
              onChangeText={setFixText}
              keyboardType="decimal-pad"
              autoFocus
              maxLength={14}
            />
            <Text style={styles.previewText}>
              {parseScoreInput(fixText) !== null ? `Saves as ${fmt(Number(parseScoreInput(fixText)!.toFixed(c.score_decimals)))}` : ' '}
            </Text>
            <View style={styles.row2}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setFixing(null)}>
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.ghostBtn, { backgroundColor: accent, borderColor: accent }]} onPress={saveFix} disabled={!!busy}>
                <Text style={[styles.ghostBtnText, { color: onAccent }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  goneTitle: { fontSize: 18, fontWeight: '800', color: '#F8FAFC', textAlign: 'center' },
  goneBody: { fontSize: 14, color: '#7A93AC', textAlign: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#0D1B2E',
  },
  headerKicker: { fontSize: 10, fontWeight: '900', color: '#7A93AC', letterSpacing: 1.6 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#F8FAFC' },
  viewBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36,
    borderRadius: 10, borderWidth: 1, borderColor: '#1A2E4A',
  },
  viewBtnText: { fontSize: 13, fontWeight: '700', color: '#CBD5E1' },

  content: {
    padding: 16, gap: 12,
    ...Platform.select({ web: { maxWidth: 720, alignSelf: 'center', width: '100%' } as any, default: {} }),
  },
  warn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12,
    backgroundColor: '#F5B70014', borderWidth: 1, borderColor: '#F5B70040',
  },
  warnText: { flex: 1, fontSize: 13, color: '#F5B700', lineHeight: 18 },

  card: {
    padding: 16, borderRadius: 16, gap: 10,
    backgroundColor: '#0D1B2E', borderWidth: 1, borderColor: '#1A2E4A',
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardKicker: { fontSize: 12, fontWeight: '900', letterSpacing: 1.6 },
  cardCount: { marginLeft: 'auto', fontSize: 12, color: '#8EADC7', fontWeight: '700' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#F8FAFC' },
  cardBody: { fontSize: 13, color: '#8EADC7', lineHeight: 18 },

  steps: { flexDirection: 'row', gap: 6 },
  step: {
    flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#1A2E4A', backgroundColor: '#07101F',
  },
  stepText: { fontSize: 13, fontWeight: '800', color: '#8EADC7' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 4 },
  switchLabel: { fontSize: 15, fontWeight: '800', color: '#F8FAFC' },

  upName: { fontSize: 30, fontWeight: '900', color: '#F8FAFC', letterSpacing: -0.5 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: '#7A93AC', letterSpacing: 1.2, marginTop: 6, textTransform: 'uppercase' },
  scoreInput: {
    height: 64, borderRadius: 14, borderWidth: 2, borderColor: '#1A2E4A',
    backgroundColor: '#07101F', color: '#F8FAFC', fontSize: 32, fontWeight: '900',
    textAlign: 'center', fontVariant: ['tabular-nums'],
  },
  previewText: { fontSize: 13, color: '#8EADC7', textAlign: 'center' },
  bigBtn: { height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  bigBtnText: { fontSize: 17, fontWeight: '900' },
  row2: { flexDirection: 'row', gap: 10 },
  ghostBtn: {
    flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#1A2E4A', backgroundColor: '#07101F',
  },
  ghostBtnText: { fontSize: 14, fontWeight: '800', color: '#CBD5E1' },
  dim: { opacity: 0.4 },
  liveTicker: {
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, gap: 2,
    backgroundColor: '#07101F', borderLeftWidth: 3,
  },
  liveTickerLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  liveTickerText: { fontSize: 15, fontWeight: '700', color: '#F8FAFC' },
  input: {
    backgroundColor: '#07101F', borderRadius: 10, padding: 12, minHeight: 46,
    color: '#F8FAFC', fontSize: 15, borderWidth: 1, borderColor: '#1A2E4A',
  },

  section: { fontSize: 11, fontWeight: '900', color: '#7A93AC', letterSpacing: 1.4, marginTop: 10 },
  empty: { fontSize: 13, color: '#4A6580', paddingVertical: 8 },
  listRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
    backgroundColor: '#0D1B2E', borderWidth: 1, borderColor: '#1A2E4A',
  },
  pos: { width: 26, fontSize: 15, fontWeight: '900', color: '#8EADC7', textAlign: 'center', fontVariant: ['tabular-nums'] },
  listName: { flex: 1, fontSize: 15, fontWeight: '700', color: '#F8FAFC' },
  listSub: { fontSize: 12, color: '#7A93AC', fontWeight: '700' },
  listScore: { fontSize: 18, fontWeight: '900', color: '#F8FAFC', fontVariant: ['tabular-nums'] },
  chipBtn: {
    paddingHorizontal: 14, height: 36, borderRadius: 10, justifyContent: 'center',
    borderWidth: 1, borderColor: '#1A2E4A',
  },
  chipBtnText: { fontSize: 13, fontWeight: '800', color: '#CBD5E1' },

  killBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 24, height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#F43F5E55',
  },
  killText: { fontSize: 14, fontWeight: '800', color: '#F43F5E' },

  fixBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  fixCard: {
    width: '100%', maxWidth: 420, padding: 18, borderRadius: 18, gap: 12,
    backgroundColor: '#0A1424', borderWidth: 1, borderColor: '#1A2E4A',
  },
})
