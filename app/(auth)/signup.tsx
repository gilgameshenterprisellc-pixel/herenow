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

  const handleSignup = async () => {
    if (!displayName || !username || !email || !password) {
      Alert.alert('Missing fields', 'Please fill in all fields.')
      return
    }

    setLoading(true)

    const { data, error } = await supabase.auth.signUp({ email, password })

    if (error || !data.user) {
      setLoading(false)
      Alert.alert('Signup failed', error?.message ?? 'Unknown error')
      return
    }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      display_name: displayName,
      username: username.toLowerCase().replace(/[^a-z0-9_]/g, ''),
    })

    setLoading(false)

    if (profileError) {
      Alert.alert('Profile error', profileError.message)
      return
    }

    // Send them to profile/edit first so they set interests + kickoff before exploring
    router.replace('/profile/edit')
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
})
