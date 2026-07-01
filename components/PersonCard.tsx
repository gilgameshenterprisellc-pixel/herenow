import { useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert, Animated, Platform } from 'react-native'
import type { ActivePerson, PrivacySettings } from '@/lib/sessions'
import SocialModeBadge from './SocialModeBadge'
import MoodBadge from './MoodBadge'
import AvatarImage from './AvatarImage'

const PRIV_ALL_ON: PrivacySettings = {
  show_social_mode: true, show_mood: true, show_interests: true, show_kickoff: true,
}

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
  const priv: PrivacySettings = person.privacy_settings ?? PRIV_ALL_ON
  const wemetScale = useRef(new Animated.Value(1)).current
  const [showActions, setShowActions] = useState(false)

  const onWemetIn  = () => Animated.spring(wemetScale, { toValue: 0.95, useNativeDriver: true, speed: 40, bounciness: 0 }).start()
  const onWemetOut = () => Animated.spring(wemetScale, { toValue: 1,    useNativeDriver: true, speed: 40, bounciness: 6 }).start()

  const showMoreMenu = () => {
    if (Platform.OS === 'web') {
      setShowActions((prev) => !prev)
    } else {
      Alert.alert(
        person.display_name,
        undefined,
        [
          { text: '🚩 Report', onPress: () => onReport?.(person) },
          { text: '🚫 Block', style: 'destructive', onPress: () => onBlock?.(person) },
          { text: 'Cancel', style: 'cancel' },
        ]
      )
    }
  }

  return (
    <View style={[styles.card, isNotToday && styles.cardMuted]}>
      <View style={styles.top}>
        <AvatarImage uri={person.avatar_url} name={person.display_name} size={50} muted={isNotToday} />

        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, isNotToday && styles.nameMuted]}>
              {person.display_name}
            </Text>
            {isMe && <Text style={styles.meTag}>You</Text>}
          </View>

          {(priv.show_social_mode || priv.show_mood) && (
            <View style={styles.badges}>
              {priv.show_social_mode && <SocialModeBadge mode={person.social_mode} />}
              {priv.show_mood && <MoodBadge mode={person.mood_mode} />}
            </View>
          )}

          {priv.show_interests && person.interest_tags?.length > 0 && (
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
          <View>
            <TouchableOpacity style={styles.moreBtn} onPress={showMoreMenu} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.moreBtnText}>⋯</Text>
            </TouchableOpacity>
            {Platform.OS === 'web' && showActions && (
              <View style={styles.webMenu}>
                {onReport && (
                  <TouchableOpacity onPress={() => { onReport(person); setShowActions(false) }} style={styles.webMenuItem}>
                    <Text style={styles.webMenuText}>🚩 Report</Text>
                  </TouchableOpacity>
                )}
                {onBlock && (
                  <TouchableOpacity onPress={() => { onBlock(person); setShowActions(false) }} style={styles.webMenuItem}>
                    <Text style={[styles.webMenuText, { color: '#f87171' }]}>🚫 Block</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setShowActions(false)} style={styles.webMenuItem}>
                  <Text style={[styles.webMenuText, { color: '#64748b' }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>

      {priv.show_kickoff && person.kickoffs?.length > 0 && !isMe && !isNotToday && (
        <View style={styles.kickoff}>
          <Text style={styles.kickoffLabel}>Ask them:</Text>
          <Text style={styles.kickoffText}>"{person.kickoffs[0]}"</Text>
        </View>
      )}

      {!isMe && !isNotToday && onWeMet && (
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => onWeMet(person)}
          onPressIn={onWemetIn}
          onPressOut={onWemetOut}
        >
          <Animated.View style={[styles.wemetBtn, { transform: [{ scale: wemetScale }] }]}>
            <Text style={styles.wemetBtnText}>🤝 We Met</Text>
          </Animated.View>
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
    backgroundColor: '#0B1828',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    gap: 12,
    ...Platform.select({
      web: { boxShadow: '0 2px 16px rgba(0,0,0,0.3)' } as any,
      default: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
    }),
  },
  cardMuted: { opacity: 0.55 },
  top: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
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
  webMenu: {
    position: 'absolute',
    top: 28,
    right: 0,
    backgroundColor: '#0D1F35',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(41,182,246,0.15)',
    zIndex: 100,
    minWidth: 130,
    overflow: 'hidden',
  },
  webMenuItem: { paddingVertical: 10, paddingHorizontal: 14 },
  webMenuText: { fontSize: 14, color: '#c0d8ec', fontWeight: '500' },
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
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0 4px 16px rgba(41,182,246,0.35)' } as any,
      default: { shadowColor: '#29B6F6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
    }),
  },
  wemetBtnText: { color: '#050A15', fontWeight: '800', fontSize: 14, letterSpacing: 0.2 },
  notTodayRow: { alignItems: 'center' },
  notTodayText: { fontSize: 12, color: '#7A93AC' },
})
