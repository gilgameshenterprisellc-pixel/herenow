import { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { PulsePost, ReactionSummary } from '@/lib/pulse'
import { deletePulsePost, togglePinPulse, togglePulseReaction, PULSE_REACTIONS, EMPTY_REACTIONS } from '@/lib/pulse'
import ExpiryLabel from './ExpiryLabel'
import { platformConfirm } from '@/lib/confirm'
import { tapFeedback } from '@/lib/haptics'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h`
}

interface Props {
  post: PulsePost
  currentUserId: string
  canPin?: boolean          // true when the viewer owns this venue
  onDeleted?: () => void
  onReport?: (postId: string) => void
  onPinChanged?: () => void
  /** Counts + this user's picks. Omit to hide the row entirely (locked preview). */
  reactions?: ReactionSummary
  canReact?: boolean
}

export default function PulsePostCard({
  post, currentUserId, canPin, onDeleted, onReport, onPinChanged,
  reactions, canReact,
}: Props) {
  const profile = post.profiles
  const initial = profile?.display_name?.[0]?.toUpperCase() ?? '?'
  const isOwn = post.user_id === currentUserId
  const isVenue = post.is_venue_post

  // Held locally so a tap lands instantly. The feed refetches on its own
  // schedule, so re-sync whenever a fresher summary arrives from above.
  const [local, setLocal] = useState<ReactionSummary>(reactions ?? EMPTY_REACTIONS)
  useEffect(() => { setLocal(reactions ?? EMPTY_REACTIONS) }, [reactions])

  const handleReact = async (emoji: string) => {
    if (!canReact) return
    const had = local.mine.includes(emoji)
    const before = local

    // Optimistic: flip it now, put it back if the write fails.
    setLocal({
      counts: { ...local.counts, [emoji]: Math.max(0, (local.counts[emoji] ?? 0) + (had ? -1 : 1)) },
      mine: had ? local.mine.filter((e) => e !== emoji) : [...local.mine, emoji],
    })
    tapFeedback()

    const res = await togglePulseReaction(post.id, emoji)
    if (!res) setLocal(before)
  }

  const handleDelete = () => {
    platformConfirm(
      'Remove post',
      'Remove this Pulse moment?',
      async () => {
        await deletePulsePost(post.id)
        onDeleted?.()
      },
      { confirmText: 'Remove', destructive: true }
    )
  }

  const handlePin = async () => {
    await togglePinPulse(post.id, !post.is_pinned)
    onPinChanged?.()
  }

  return (
    <View style={[styles.card, isVenue && styles.cardVenue, post.is_pinned && styles.cardPinned]}>
      <View style={styles.top}>
        <View style={[styles.avatar, isVenue && styles.avatarVenue]}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.meta}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{profile?.display_name ?? 'Someone'}</Text>
            {isVenue && <Text style={styles.venueTag}>VENUE</Text>}
            {post.is_pinned && <Ionicons name="pin" size={12} color="#C9940C" style={styles.pinnedTag} />}
          </View>
          <Text style={styles.time}>{timeAgo(post.created_at)}</Text>
        </View>
        <ExpiryLabel expiresAt={post.expires_at} />
        {isOwn ? (
          <TouchableOpacity onPress={handleDelete} style={styles.iconBtn}>
            <Text style={styles.deleteText}>✕</Text>
          </TouchableOpacity>
        ) : onReport ? (
          <TouchableOpacity onPress={() => onReport(post.id)} style={styles.iconBtn}>
            <Ionicons name="flag" size={13} color="#7A93AC" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Media-first: photo takes center stage */}
      {post.media_url && (
        <Image source={{ uri: post.media_url }} style={styles.media} resizeMode="cover" />
      )}

      {post.vibe_tag && (
        <View style={styles.vibeTag}>
          <Text style={styles.vibeTagText}>{post.vibe_tag}</Text>
        </View>
      )}

      {post.content && (
        <Text style={styles.content}>{post.content}</Text>
      )}

      {/* Reactions — the whole set is always shown so it's obvious you can tap.
          Counts only appear once someone has actually reacted, so a quiet post
          reads as an invitation rather than a row of zeroes. */}
      {reactions !== undefined && (
        <View style={styles.reactionRow}>
          {PULSE_REACTIONS.map((emoji) => {
            const count = local.counts[emoji] ?? 0
            const mine  = local.mine.includes(emoji)
            return (
              <TouchableOpacity
                key={emoji}
                style={[styles.reactionPill, mine && styles.reactionPillMine]}
                onPress={() => handleReact(emoji)}
                disabled={!canReact}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={`React ${emoji}${count > 0 ? `, ${count} so far` : ''}`}
              >
                <Text style={styles.reactionEmoji}>{emoji}</Text>
                {count > 0 && (
                  <Text style={[styles.reactionCount, mine && styles.reactionCountMine]}>{count}</Text>
                )}
              </TouchableOpacity>
            )
          })}
        </View>
      )}

      {/* Venue owner: pin control on their own venue posts */}
      {canPin && isVenue && (
        <TouchableOpacity onPress={handlePin} style={styles.pinBtn}>
          <Text style={styles.pinBtnText}>{post.is_pinned ? 'Unpin' : 'Pin to top'}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0D1B2E',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    gap: 8,
    overflow: 'hidden',
  },
  cardVenue: { borderColor: '#f59e0b55', backgroundColor: '#14110A' },
  cardPinned: { borderColor: '#f59e0b', borderWidth: 1.5 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#a855f7',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarVenue: { backgroundColor: '#f59e0b' },
  avatarText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  meta: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 13, fontWeight: '700', color: '#f8fafc' },
  venueTag: {
    fontSize: 9, fontWeight: '900', color: '#f59e0b', letterSpacing: 1,
    backgroundColor: '#f59e0b20', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1,
  },
  pinnedTag: { fontSize: 11 },
  time: { fontSize: 11, color: '#7A93AC' },
  iconBtn: { padding: 4 },
  deleteText: { fontSize: 13, color: '#7A93AC' },
  flagText: { fontSize: 14 },
  media: {
    width: '100%', aspectRatio: 4 / 3, borderRadius: 10, backgroundColor: '#07101F',
  },
  vibeTag: {
    backgroundColor: '#a855f718', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: '#a855f733',
  },
  vibeTagText: { fontSize: 12, color: '#a855f7', fontWeight: '600' },
  content: { fontSize: 14, color: '#D0E8F5', lineHeight: 20 },
  reactionRow: { flexDirection: 'row', gap: 6, marginTop: 2, flexWrap: 'wrap' },
  reactionPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#07101F',
    borderWidth: 1, borderColor: '#1A2E4A',
    borderRadius: 14,
    paddingHorizontal: 9, paddingVertical: 5,
    minHeight: 30,
  },
  reactionPillMine: { backgroundColor: '#29B6F618', borderColor: '#29B6F660' },
  reactionEmoji: { fontSize: 14, lineHeight: 18 },
  reactionCount: { fontSize: 11, fontWeight: '700', color: '#7A93AC' },
  reactionCountMine: { color: '#29B6F6' },
  pinBtn: {
    alignSelf: 'flex-start', marginTop: 2,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    borderWidth: 1, borderColor: '#f59e0b40', backgroundColor: '#f59e0b12',
  },
  pinBtnText: { fontSize: 12, color: '#f59e0b', fontWeight: '700' },
})
