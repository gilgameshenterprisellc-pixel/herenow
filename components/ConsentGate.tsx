import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking, Platform, ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import {
  CONSENT_DOCS, fetchOutstandingConsents, recordConsent, subscribeConsentChanges,
  type ConsentDoc,
} from '@/lib/consent'

// Public copies of the same documents the in-app screens show, so a link can be
// opened without leaving this blocking screen.
const PUBLIC_BASE = 'https://herenowsocial.com'

// Full-screen "agree to the updated terms" screen. Anyone who has not agreed to
// the CURRENT version of the Terms, Community Guidelines and Privacy Policy sees
// it once, whether they signed up before the documents changed or never went
// through the signup checkboxes (the App Review account, for instance).
//
// Fails open: it only appears when the database positively says something is
// outstanding. A read error, an offline phone, or a missing table never traps
// a signed-in person behind it.
export default function ConsentGate() {
  const insets = useSafeAreaInsets()
  const [userId, setUserId]           = useState<string | null>(null)
  const [outstanding, setOutstanding] = useState<ConsentDoc[]>([])
  const [saving, setSaving]           = useState(false)
  const [failed, setFailed]           = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const check = useCallback(async (uid: string | null) => {
    if (!uid) { setOutstanding([]); return }
    const result = await fetchOutstandingConsents(uid)
    if (result === null) return          // unknown: do not block
    setOutstanding(result)
  }, [])

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      setUserId(session?.user?.id ?? null)
      check(session?.user?.id ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id ?? null
      setUserId(uid)
      if (!uid) { setOutstanding([]); return }
      if (timer.current) clearTimeout(timer.current)
      // A fresh sign-in can be a brand-new signup that is a moment away from
      // recording its own consent. Give it a beat so the gate does not flash
      // up over the signup screen; recordConsent also tells us directly.
      timer.current = setTimeout(() => check(uid), event === 'SIGNED_IN' ? 2500 : 0)
    })

    const unsubscribeConsent = subscribeConsentChanges(() => {
      supabase.auth.getSession().then(({ data: { session } }) => check(session?.user?.id ?? null))
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
      unsubscribeConsent()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [check])

  if (!userId || outstanding.length === 0) return null

  const agree = async () => {
    setSaving(true)
    setFailed(false)
    const ok = await recordConsent(userId)
    setSaving(false)
    if (!ok) { setFailed(true); return }
    setOutstanding([])
  }

  const open = (doc: ConsentDoc) => {
    const url = `${PUBLIC_BASE}${CONSENT_DOCS[doc].href}`
    if (Platform.OS === 'web') (window as any).open(url, '_blank', 'noopener')
    else Linking.openURL(url).catch(() => {})
  }

  return (
    <View style={styles.overlay} accessibilityViewIsModal>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 }]}
      >
        <Text style={styles.title}>Our terms have been updated</Text>
        <Text style={styles.body}>
          HereNow has no tolerance for objectionable content or abusive users. You can report or
          block anyone from the options button on any message, post, profile, or conversation, and
          we act on every report within 24 hours by removing the content and ejecting the user who
          posted it.
        </Text>
        <Text style={styles.body}>
          To keep using HereNow, please read and agree to the current versions.
        </Text>

        <View style={styles.links}>
          {(['terms', 'guidelines', 'privacy'] as ConsentDoc[]).map((doc, i) => (
            <TouchableOpacity
              key={doc}
              style={[styles.linkRow, i > 0 && styles.linkBorder]}
              onPress={() => open(doc)}
              accessibilityRole="link"
            >
              <Text style={styles.linkText}>{CONSENT_DOCS[doc].label}</Text>
              <Text style={styles.linkArrow}>Read ›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {failed && (
          <Text style={styles.error}>We could not save your agreement. Check your connection and try again.</Text>
        )}

        <TouchableOpacity
          style={[styles.agreeBtn, saving && { opacity: 0.6 }]}
          onPress={agree}
          disabled={saving}
          accessibilityRole="button"
        >
          {saving
            ? <ActivityIndicator color="#050A15" />
            : <Text style={styles.agreeText}>I agree to the Terms, Community Guidelines and Privacy Policy</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => supabase.auth.signOut()} style={styles.signOut} accessibilityRole="button">
          <Text style={styles.signOutText}>Sign out instead</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#050A15', zIndex: 1000, elevation: 1000,
  },
  content: {
    paddingHorizontal: 24, gap: 16,
    ...Platform.select({ web: { maxWidth: 520, alignSelf: 'center', width: '100%' } as any, default: {} }),
  },
  title: { fontSize: 24, fontWeight: '800', color: '#f8fafc' },
  body: { fontSize: 15, color: '#B8D4E8', lineHeight: 22 },
  links: {
    backgroundColor: '#0D1B2E', borderRadius: 14, borderWidth: 1, borderColor: '#1A2E4A',
    overflow: 'hidden', marginTop: 4,
  },
  linkRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 16, paddingHorizontal: 16, minHeight: 52,
  },
  linkBorder: { borderTopWidth: 1, borderTopColor: '#1A2E4A' },
  linkText: { fontSize: 15, fontWeight: '600', color: '#f8fafc' },
  linkArrow: { fontSize: 14, color: '#29B6F6', fontWeight: '700' },
  error: { fontSize: 13, color: '#f87171', lineHeight: 18 },
  agreeBtn: {
    backgroundColor: '#29B6F6', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 18,
    alignItems: 'center', minHeight: 52, justifyContent: 'center', marginTop: 8,
  },
  agreeText: { color: '#050A15', fontWeight: '800', fontSize: 15, textAlign: 'center' },
  signOut: { alignItems: 'center', paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  signOutText: { color: '#7A93AC', fontSize: 14, fontWeight: '600' },
})
