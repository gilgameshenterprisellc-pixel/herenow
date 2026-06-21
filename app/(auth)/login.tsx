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
        <Image
          source={require('@/assets/logo.webp')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>HereNow</Text>
        <Text style={styles.subtitle}>Connect where you are.</Text>

        <View style={styles.form}>
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
            autoComplete="current-password"
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#050A15" />
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
    width: 80,
    height: 80,
    marginBottom: 14,
  },
  title: { fontSize: 26, fontWeight: '800', color: '#f8fafc', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#7A93AC', marginBottom: 36 },
  form: { width: '100%', gap: 12 },
  input: {
    backgroundColor: '#050A15',
    borderWidth: 1,
    borderColor: '#1A2E4A',
    borderRadius: 10,
    padding: 14,
    color: '#f8fafc',
    fontSize: 15,
  },
  button: {
    backgroundColor: '#29B6F6',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#050A15', fontWeight: '800', fontSize: 15 },
  link: { alignSelf: 'center', marginTop: 16 },
  linkText: { color: '#7A93AC', fontSize: 13 },
})
