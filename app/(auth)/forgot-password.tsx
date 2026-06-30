import { useState } from 'react'
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'

export default function ForgotPasswordScreen() {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')

  const handleSend = async () => {
    if (!email.trim()) return
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: 'herenow://reset-password',
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    setSent(true)
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.sub}>
          Enter your email and we'll send a reset link.
        </Text>

        {sent ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>
              ✓ Check your email — a reset link is on its way.
            </Text>
          </View>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#2B4560"
              value={email}
              onChangeText={(t) => { setEmail(t); setError('') }}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              returnKeyType="go"
              onSubmitEditing={handleSend}
            />
            {!!error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity
              style={[styles.btn, (!email.trim() || loading) && styles.btnDisabled]}
              onPress={handleSend}
              disabled={!email.trim() || loading}
            >
              {loading
                ? <ActivityIndicator color="#050A15" />
                : <Text style={styles.btnText}>Send Reset Link</Text>
              }
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>← Back to Sign In</Text>
        </TouchableOpacity>
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
    width: '100%', maxWidth: 400,
    marginHorizontal: 20,
    backgroundColor: '#060D1A',
    borderRadius: 24, borderWidth: 1,
    borderColor: 'rgba(41,182,246,0.2)',
    paddingHorizontal: 26, paddingVertical: 32,
    gap: 16,
  },
  title:   { fontSize: 22, fontWeight: '900', color: '#f8fafc', textAlign: 'center' },
  sub:     { fontSize: 14, color: '#3A5C7A', textAlign: 'center', lineHeight: 20 },
  input: {
    backgroundColor: '#0B1526', borderWidth: 1,
    borderColor: 'rgba(41,182,246,0.15)', borderRadius: 12,
    paddingHorizontal: 15, paddingVertical: 14,
    color: '#f8fafc', fontSize: 15,
  },
  btn: {
    backgroundColor: '#29B6F6', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#050A15', fontWeight: '900', fontSize: 15 },
  error: { color: '#f87171', fontSize: 13, textAlign: 'center' },
  successBox: {
    backgroundColor: '#22c55e18', borderRadius: 12,
    borderWidth: 1, borderColor: '#22c55e40',
    padding: 16,
  },
  successText: { color: '#22c55e', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  backLink: { alignItems: 'center', paddingTop: 4 },
  backLinkText: { color: '#3A5C7A', fontSize: 13 },
})
