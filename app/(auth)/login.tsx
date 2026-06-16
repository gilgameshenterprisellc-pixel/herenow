'use client'
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
import { Link, router } from 'expo-router'
import { supabase } from '@/lib/supabase'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!email || !password) return
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      Alert.alert('Login failed', error.message)
    } else {
      router.replace('/(tabs)')
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>H</Text>
        </View>
        <Text style={styles.title}>HereNow</Text>
        <Text style={styles.subtitle}>Connect where you are.</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#64748b"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#64748b"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#0f172a" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <Link href="/(auth)/signup" style={styles.link}>
            <Text style={styles.linkText}>New here? Create an account</Text>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoText: { fontSize: 32, fontWeight: '900', color: '#0f172a' },
  title: { fontSize: 28, fontWeight: '800', color: '#f8fafc', marginBottom: 4 },
  subtitle: { fontSize: 15, color: '#64748b', marginBottom: 40 },
  form: { width: '100%', gap: 12 },
  input: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 16,
    color: '#f8fafc',
    fontSize: 15,
  },
  button: {
    backgroundColor: '#f59e0b',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#0f172a', fontWeight: '700', fontSize: 16 },
  link: { alignSelf: 'center', marginTop: 8 },
  linkText: { color: '#64748b', fontSize: 14 },
})
