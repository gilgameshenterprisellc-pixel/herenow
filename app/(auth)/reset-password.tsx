import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { supabase } from '@/lib/supabase'

// A reset link only works if it actually established a session (the root layout
// consumes the tokens — see lib/authLinks.ts). Without one, updateUser() fails
// with "Auth session missing" no matter what the user types, so the form must
// not be shown at all. That silent failure was the whole bug.
type LinkState = 'checking' | 'ready' | 'invalid'

export default function ResetPasswordScreen() {
  const { invalid }               = useLocalSearchParams<{ invalid?: string }>()
  const [linkState, setLinkState] = useState<LinkState>(invalid ? 'invalid' : 'checking')
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [showPw, setShowPw]       = useState(false)
  const [loading, setLoading]     = useState(false)
  const [done, setDone]           = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    if (invalid) return
    let cancelled = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!cancelled && session) setLinkState('ready')
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled && session) setLinkState('ready')
    })

    // The root layout may still be exchanging the token when this mounts, so
    // don't condemn the link on the first miss — give it a moment to land.
    const timer = setTimeout(() => {
      if (!cancelled) setLinkState((s) => (s === 'checking' ? 'invalid' : s))
    }, 4000)

    return () => {
      cancelled = true
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [invalid])

  const handleReset = async () => {
    if (password !== confirm) { setError("Passwords don't match."); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (err) { setError(err.message); return }
    setDone(true)
    setTimeout(() => router.replace('/(auth)/login'), 2000)
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.card}>
        <Text style={styles.title}>New Password</Text>
        <Text style={styles.sub}>Choose a new password for your account.</Text>

        {linkState === 'checking' ? (
          <View style={styles.checkingBox}>
            <ActivityIndicator color="#29B6F6" />
            <Text style={styles.checkingText}>Checking your reset link…</Text>
          </View>
        ) : linkState === 'invalid' ? (
          <View style={styles.invalidBox}>
            <Ionicons name="alert-circle-outline" size={22} color="#FF8A80" />
            <Text style={styles.invalidTitle}>This reset link didn't work</Text>
            <Text style={styles.invalidText}>
              Reset links expire, and each one can only be used once. Request a fresh
              one and open it on the same device you have HereNow installed on.
            </Text>
            <TouchableOpacity style={styles.btn} onPress={() => router.replace('/(auth)/forgot-password')}>
              <Text style={styles.btnText}>Send a new link</Text>
            </TouchableOpacity>
          </View>
        ) : done ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>✓ Password updated — taking you back to sign in.</Text>
          </View>
        ) : (
          <>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                placeholder="New password"
                placeholderTextColor="#2B4560"
                value={password}
                onChangeText={(t) => { setPassword(t); setError('') }}
                secureTextEntry={!showPw}
                autoComplete="new-password"
                returnKeyType="next"
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPw(v => !v)}>
                <Ionicons name={showPw ? 'eye-off' : 'eye'} size={18} color="#7A93AC" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Confirm new password"
              placeholderTextColor="#2B4560"
              value={confirm}
              onChangeText={(t) => { setConfirm(t); setError('') }}
              secureTextEntry={!showPw}
              returnKeyType="go"
              onSubmitEditing={handleReset}
            />
            {!!error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity
              style={[styles.btn, (!password || !confirm || loading) && styles.btnDisabled]}
              onPress={handleReset}
              disabled={!password || !confirm || loading}
            >
              {loading
                ? <ActivityIndicator color="#050A15" />
                : <Text style={styles.btnText}>Update Password</Text>
              }
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1, backgroundColor: '#020810',
    alignItems: 'center', justifyContent: 'center',
  },
  card: {
    width: '100%', maxWidth: 400, marginHorizontal: 20,
    backgroundColor: '#060D1A', borderRadius: 24,
    borderWidth: 1, borderColor: 'rgba(41,182,246,0.2)',
    paddingHorizontal: 26, paddingVertical: 32, gap: 14,
  },
  title: { fontSize: 22, fontWeight: '900', color: '#f8fafc', textAlign: 'center' },
  sub:   { fontSize: 14, color: '#3A5C7A', textAlign: 'center', lineHeight: 20 },
  inputWrap: { position: 'relative' },
  input: {
    backgroundColor: '#0B1526', borderWidth: 1,
    borderColor: 'rgba(41,182,246,0.15)', borderRadius: 12,
    paddingHorizontal: 15, paddingVertical: 14,
    paddingRight: 46, color: '#f8fafc', fontSize: 15,
  },
  eyeBtn: {
    position: 'absolute', right: 14,
    top: 0, bottom: 0, justifyContent: 'center',
  },
  eyeText: { fontSize: 16 },
  btn: {
    backgroundColor: '#29B6F6', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#050A15', fontWeight: '900', fontSize: 15 },
  error: { color: '#f87171', fontSize: 13, textAlign: 'center' },
  successBox: {
    backgroundColor: '#22c55e18', borderRadius: 12,
    borderWidth: 1, borderColor: '#22c55e40', padding: 16,
  },
  successText: { color: '#22c55e', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  checkingBox: { alignItems: 'center', gap: 10, paddingVertical: 18 },
  checkingText: { color: '#7A93AC', fontSize: 13 },
  invalidBox: {
    backgroundColor: '#FF8A8012', borderRadius: 12,
    borderWidth: 1, borderColor: '#FF8A8033', padding: 16,
    alignItems: 'center', gap: 8,
  },
  invalidTitle: { color: '#f8fafc', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  invalidText: { color: '#7A93AC', fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 4 },
})
