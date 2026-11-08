import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@estene/theme/tokens';
import { RiderLoginSchema } from '@estene/contracts/auth';
import { Button, Field, Notice, T, space } from '../components/ui';
import { useAuth } from '../hooks/auth';
import { errorMessage } from '../lib/api';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ phone?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    const parsed = RiderLoginSchema.safeParse({ phone, password });
    if (!parsed.success) {
      const errs: typeof fieldErrors = {};
      for (const i of parsed.error.issues) errs[i.path[0] as 'phone' | 'password'] ??= i.message;
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      await signIn(parsed.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.wrap}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.inner}
      >
        <View style={s.brand}>
          <Image source={require('../../assets/splash-icon.png')} style={s.logo} />
          <T size={28} weight="800">
            Estene Rider
          </T>
          <T tone="muted">Sign in with the phone number and password from Estene operations.</T>
        </View>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Field
          label="Phone number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          placeholder="0803 000 0001"
          error={fieldErrors.phone}
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          error={fieldErrors.password}
          onSubmitEditing={submit}
          returnKeyType="go"
        />
        <Button title="Sign in" onPress={submit} loading={busy} />
        <T size={13} tone="muted" style={{ textAlign: 'center' }}>
          Forgot your password? Ask operations to reset it.
        </T>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background },
  inner: { flex: 1, padding: space.xl, gap: space.lg, justifyContent: 'center' },
  brand: { alignItems: 'center', gap: space.sm, marginBottom: space.md },
  logo: { width: 96, height: 96 },
});
