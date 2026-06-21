import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { Image } from 'react-native'
import { Link, router } from 'expo-router'
import { supabase } from '@/lib/supabase'

export default function SignupScreen() {
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const cleanUsername = (raw: string) => raw.toLowerCase().replace(/[^a-z0-9_]/g, '')

  const handleSignup = async () => {
    if (!displayName || !username || !email || !password) {
      Alert.alert('Missing fields', 'Please fill in all fields.')
      return
    }
    if (cleanUsername(username).length < 3) {
      Alert.alert('Username too short', 'Username must be at least 3 characters (letters, numbers, _).')
      return
    }

    setLoading(true)

    const redirectTo = Platform.OS === 'web' ? window.location.origin : undefined

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo },
    })

    if (error || !data.user) {
      setLoading(false)
      Alert.alert('Signup failed', error?.message ?? 'Unknown error')
      return
    }

    // Store profile data so we can create it after email confirmation
    if (Platform.OS === 'web') {
      localStorage.setItem('herenow_pending_profile', JSON.stringify({
        displayName,
        username: cleanUsername(username),
      }))
    }

    // No session = email confirmation is required
    if (!data.session) {
      setLoading(false)
      setSent(true)
      return
    }

    // Session exists = email confirmation is OFF, create profile immediately
    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      display_name: displayName,
      username: cleanUsername(username),
    })

    setLoading(false)

    if (profileError) {
      Alert.alert('Profile error', profileError.message)
      return
    }

    if (Platform.OS === 'web') localStorage.removeItem('herenow_pending_profile')
    router.replace('/profile/edit')
  }

  if (sent) {
    return (
      <View style={styles.container}>
        <View style={[styles.inner, styles.sentBox]}>
          <Text style={styles.sentEmoji}>📬</Text>
          <Text style={styles.sentTitle}>Check your inbox</Text>
          <Text style={styles.sentSub}>
            We sent a confirmation link to{'\n'}
            <Text style={styles.sentEmail}>{email}</Text>
          </Text>
          <Text style={styles.sentHint}>
            Click the link to activate your account, then come back here and sign in.
          </Text>
          <Link href="/(auth)/login" style={styles.sentBtn}>
            <Text style={styles.sentBtnText}>Go to Sign In →</Text>
          </Link>
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <Image
          source={require('@/assets/logo.webp')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>Join HereNow</Text>
        <Text style={styles.subtitle}>Be present. Connect locally.</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Display name"
            placeholderTextColor="#7A93AC"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
          />
          <TextInput
            style={styles.input}
            placeholder="Username (no spaces)"
            placeholderTextColor="#7A93AC"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#7A93AC"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#7A93AC"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignup}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#050A15" />
            ) : (
              <Text style={styles.buttonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <Link href="/(auth)/login" style={styles.link}>
            <Text style={styles.linkText}>Already have an account? Sign in</Text>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A15', alignItems: 'center', justifyContent: 'center' },
  inner: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 48,
    backgroundColor: '#0A1628',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1A2E4A',
  },
  logo: {
    width: 90,
    height: 90,
    marginBottom: 16,
  },
  title: { fontSize: 28, fontWeight: '800', color: '#f8fafc', marginBottom: 4 },
  subtitle: { fontSize: 15, color: '#7A93AC', marginBottom: 40 },
  form: { width: '100%', gap: 12 },
  input: {
    backgroundColor: '#0D1B2E',
    borderWidth: 1,
    borderColor: '#1A2E4A',
    borderRadius: 12,
    padding: 16,
    color: '#f8fafc',
    fontSize: 15,
  },
  button: {
    backgroundColor: '#29B6F6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#050A15', fontWeight: '700', fontSize: 16 },
  link: { alignSelf: 'center', marginTop: 8 },
  linkText: { color: '#7A93AC', fontSize: 14 },
  sentBox: { alignItems: 'center', gap: 16 },
  sentEmoji: { fontSize: 52, marginBottom: 8 },
  sentTitle: { fontSize: 24, fontWeight: '900', color: '#f8fafc' },
  sentSub: { fontSize: 14, color: '#8EADC7', textAlign: 'center', lineHeight: 22 },
  sentEmail: { color: '#29B6F6', fontWeight: '700' },
  sentHint: { fontSize: 13, color: '#4A6580', textAlign: 'center', lineHeight: 19, paddingHorizontal: 12 },
  sentBtn: {
    backgroundColor: '#29B6F6', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32,
    marginTop: 8, alignSelf: 'stretch', alignItems: 'center',
  },
  sentBtnText: { color: '#050A15', fontWeight: '800', fontSize: 15, textAlign: 'center' },
})
