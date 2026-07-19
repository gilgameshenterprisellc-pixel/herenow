import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { useState } from 'react'
import type { WeMet } from '@/lib/weMet'
import { confirmWeMet, declineWeMet } from '@/lib/weMet'
import ExpiryLabel from './ExpiryLabel'

interface Props {
  wemet: WeMet
  currentUserId: string
  onUpdate?: () => void
}

export default function WemetCard({ wemet, currentUserId, onUpdate }: Props) {
  const [acting, setActing] = useState(false)

  const isRecipient  = wemet.recipient_id === currentUserId
  const isPending    = wemet.status === 'pending'
  const isConfirmed  = wemet.status === 'confirmed'
  const isDeclined   = wemet.status === 'declined'
  const isExpired    = wemet.status === 'expired' || (wemet.expires_at != null && new Date(wemet.expires_at) < new Date())

  const otherProfile = currentUserId === wemet.initiator_id
    ? wemet.recipient_profile
    : wemet.initiator_profile

  const initial = otherProfile?.display_name?.[0]?.toUpperCase() ?? '?'

  const handleConfirm = async () => {
    setActing(true)
    await confirmWeMet(wemet.id)
    onUpdate?.()
    setActing(false)
  }

  const handleDecline = async () => {
    setActing(true)
    await declineWeMet(wemet.id)
    onUpdate?.()
    setActing(false)
  }

  return (
    <View style={[styles.card, isConfirmed && styles.confirmed, (isDeclined || isExpired) && styles.muted]}>
      <View style={styles.top}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{otherProfile?.display_name ?? 'Someone'}</Text>
          <Text style={styles.sub}>
            {isPending && isRecipient  && 'Wants to confirm you met'}
            {isPending && !isRecipient && 'Waiting for confirmation'}
            {isConfirmed               && 'Connection confirmed!'}
            {isDeclined                && 'Declined'}
            {isExpired                 && 'Expired'}
          </Text>
        </View>
        {!isExpired && !isDeclined && wemet.expires_at && (
          <ExpiryLabel expiresAt={wemet.expires_at} />
        )}
      </View>

      {isPending && isRecipient && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.declineBtn}
            onPress={handleDecline}
            disabled={acting}
          >
            <Text style={styles.declineBtnText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.confirmBtn}
            onPress={handleConfirm}
            disabled={acting}
          >
            {acting
              ? <ActivityIndicator color="#050A15" size="small" />
              : <Text style={styles.confirmBtnText}>✓ Confirm</Text>
            }
          </TouchableOpacity>
        </View>
      )}

      {isConfirmed && (
        <Text style={styles.dmHint}>You can now message each other</Text>
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
    gap: 12,
  },
  confirmed: { borderColor: '#22c55e44' },
  muted: { opacity: 0.5 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#29B6F6',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 17, fontWeight: '800', color: '#050A15' },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: '#f8fafc' },
  sub:  { fontSize: 12, color: '#7A93AC', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10 },
  declineBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#1A2E4A',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  declineBtnText: { color: '#8EADC7', fontWeight: '600', fontSize: 14 },
  confirmBtn: {
    flex: 2,
    backgroundColor: '#22c55e',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  dmHint: { fontSize: 12, color: '#22c55e', textAlign: 'center' },
})
