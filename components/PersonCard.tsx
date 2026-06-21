import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import type { ActivePerson } from '@/lib/sessions'
import SocialModeBadge from './SocialModeBadge'
import MoodBadge from './MoodBadge'

interface Props {
  person: ActivePerson
  currentUserId: string
  zoneId: string
  currentSessionId?: string | null
  onWeMet?: (person: ActivePerson) => void
  onReport?: (person: ActivePerson) => void
  onBlock?: (person: ActivePerson) => void
}

export default function PersonCard({ person, currentUserId, zoneId, currentSessionId, onWeMet, onReport, onBlock }: Props) {
  const isMe = person.user_id === currentUserId
  const isNotToday = person.mood_mode === 'not_today'
  const initial = person.display_name[0]?.toUpperCase() ?? '?'

  const showMoreMenu = () => {
    Alert.alert(
      person.display_name,
      undefined,
      [
        {
          text: '🚩 Report',
          onPress: () => onReport?.(person),
        },
        {
          text: '🚫 Block',
          style: 'destructive',
          onPress: () => onBlock?.(person),
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    )
  }

  return (
    <View style={[styles.card, isNotToday && styles.cardMuted]}>
      <View style={styles.top}>
        <View style={[styles.avatar, isNotToday && styles.avatarMuted]}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>

        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, isNotToday && styles.nameMuted]}>
              {person.display_name}
            </Text>
            {isMe && <Text style={styles.meTag}>You</Text>}
          </View>

          <View style={styles.badges}>
            <SocialModeBadge mode={person.social_mode} />
            <MoodBadge mode={person.mood_mode} />
          </View>

          {person.interest_tags?.length > 0 && (
            <View style={styles.tags}>
              {person.interest_tags.slice(0, 3).map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ⋯ menu — only for other people */}
        {!isMe && (onReport || onBlock) && (
          <TouchableOpacity style={styles.moreBtn} onPress={showMoreMenu} hitSlop={8}>
            <Text style={styles.moreBtnText}>⋯</Text>
          </TouchableOpacity>
        )}
      </View>

      {person.kickoffs?.length > 0 && !isMe && !isNotToday && (
        <View style={styles.kickoff}>
          <Text style={styles.kickoffLabel}>Ask them:</Text>
          <Text style={styles.kickoffText}>"{person.kickoffs[0]}"</Text>
        </View>
      )}

      {!isMe && !isNotToday && onWeMet && (
        <TouchableOpacity
          style={styles.wemetBtn}
          onPress={() => onWeMet(person)}
          activeOpacity={0.8}
        >
          <Text style={styles.wemetBtnText}>🤝 We Met</Text>
        </TouchableOpacity>
      )}

      {!isMe && isNotToday && (
        <View style={styles.notTodayRow}>
          <Text style={styles.notTodayText}>🛡️ Not available right now</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0D1B2E',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    gap: 10,
  },
  cardMuted: { opacity: 0.6 },
  top: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#29B6F6',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarMuted: { backgroundColor: '#1A2E4A' },
  avatarText: { fontSize: 18, fontWeight: '800', color: '#050A15' },
  info: { flex: 1, gap: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, fontWeight: '700', color: '#f8fafc' },
  nameMuted: { color: '#7A93AC' },
  meTag: {
    fontSize: 10,
    color: '#29B6F6',
    fontWeight: '700',
    backgroundColor: '#29B6F618',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#29B6F633',
  },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tags: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginTop: 2 },
  tag: {
    backgroundColor: '#050A15',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: { fontSize: 11, color: '#8EADC7' },
  moreBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  moreBtnText: { fontSize: 20, color: '#4A6580', letterSpacing: 1 },
  kickoff: {
    backgroundColor: '#050A15',
    borderRadius: 10,
    padding: 10,
    gap: 2,
  },
  kickoffLabel: { fontSize: 11, color: '#7A93AC', fontWeight: '600' },
  kickoffText: { fontSize: 13, color: '#B8D4E8', fontStyle: 'italic', lineHeight: 18 },
  wemetBtn: {
    backgroundColor: '#29B6F6',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  wemetBtnText: { color: '#050A15', fontWeight: '700', fontSize: 14 },
  notTodayRow: { alignItems: 'center' },
  notTodayText: { fontSize: 12, color: '#7A93AC' },
})
