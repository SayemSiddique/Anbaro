import type { CurrentUser } from '@stock/contracts';
import { ApiClientError } from '@stock/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState, StyleSheet, Text, TextInput, View } from 'react-native';

import { tokens } from '@stock/design-tokens';

import { MobileSessionController } from '../lib/session';
import { CountedWordmark } from './brand';
import { LoadingPanel, PrimaryButton, SecondaryButton, StatePanel } from './ui';

type MobileSessionState =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'error' }
  | { kind: 'ready'; user: CurrentUser };
type MobileSessionContextValue = {
  state: MobileSessionState;
  controller: MobileSessionController;
  reload: () => Promise<void>;
};
const MobileSessionContext = createContext<MobileSessionContextValue | null>(null);

export function useMobileSession() {
  const context = useContext(MobileSessionContext);
  if (!context) throw new Error('Mobile session context is unavailable.');
  return context;
}

export function MobileShell({ children }: { children: ReactNode }) {
  const controller = useMemo(() => new MobileSessionController(), []);
  const [state, setState] = useState<MobileSessionState>({ kind: 'loading' });
  const bootstrap = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const user = await controller.bootstrap();
      setState(user ? { kind: 'ready', user } : { kind: 'signed-out' });
    } catch {
      setState({ kind: 'error' });
    }
  }, [controller]);
  useEffect(() => {
    void bootstrap();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void bootstrap();
    });
    return () => subscription.remove();
  }, [bootstrap]);
  const content =
    state.kind === 'loading' ? (
      <LoadingPanel />
    ) : state.kind === 'signed-out' ? (
      <MobileAccessForm controller={controller} onAuthenticated={bootstrap} />
    ) : state.kind === 'error' ? (
      <StatePanel
        action={<PrimaryButton onPress={() => void bootstrap()}>Try again</PrimaryButton>}
        detail="We could not load your account. Check your connection and try again."
        title="Couldn’t load your workspace"
        tone="error"
      />
    ) : (
      children
    );
  return (
    <MobileSessionContext.Provider value={{ state, controller, reload: bootstrap }}>
      <View style={styles.container}>{content}</View>
    </MobileSessionContext.Provider>
  );
}

function MobileAccessForm({
  controller,
  onAuthenticated,
}: {
  controller: MobileSessionController;
  onAuthenticated: () => Promise<void>;
}) {
  const [mode, setMode] = useState<'sign-up' | 'sign-in'>('sign-up');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  async function submit() {
    setError('');
    setWorking(true);
    try {
      if (mode === 'sign-up') await controller.register({ name, email, password });
      else await controller.login({ email, password });
      await onAuthenticated();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : 'Check your connection and try again.',
      );
    } finally {
      setWorking(false);
    }
  }
  return (
    <View style={styles.form}>
      <View style={styles.brand}>
        <CountedWordmark size={44} />
        <Text style={styles.tagline}>Inventory that adds up.</Text>
      </View>
      <Text accessibilityRole="header" style={styles.title}>
        {mode === 'sign-up' ? 'Start your free trial' : 'Welcome back'}
      </Text>
      <Text style={styles.detail}>
        {mode === 'sign-up'
          ? 'No card is required. Create your organization and first location next.'
          : 'Sign in to your Counted workspace.'}
      </Text>
      {mode === 'sign-up' ? (
        <TextInput
          accessibilityLabel="Name"
          onChangeText={setName}
          placeholder="Name"
          style={styles.input}
          value={name}
        />
      ) : null}
      <TextInput
        accessibilityLabel="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        onChangeText={setEmail}
        placeholder="Email"
        style={styles.input}
        value={email}
      />
      <TextInput
        accessibilityLabel="Password"
        onChangeText={setPassword}
        placeholder="Password (8+ characters)"
        secureTextEntry
        style={styles.input}
        value={password}
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <PrimaryButton
        disabled={working || !email || password.length < 8 || (mode === 'sign-up' && !name)}
        onPress={() => void submit()}
      >
        {working ? 'Working…' : mode === 'sign-up' ? 'Create account' : 'Sign in'}
      </PrimaryButton>
      <SecondaryButton onPress={() => setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up')}>
        {mode === 'sign-up' ? 'I already have an account' : 'New to Counted? Start a free trial'}
      </SecondaryButton>
    </View>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', gap: 8, marginBottom: 16 },
  container: {
    backgroundColor: tokens.color.canvas,
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  detail: { color: tokens.color.textMuted, fontSize: 16, lineHeight: 24 },
  error: { color: tokens.color.danger },
  form: { gap: 12, marginHorizontal: 'auto', maxWidth: 480, width: '100%' },
  tagline: { color: tokens.color.textMuted, fontSize: 15 },
  input: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.borderStrong,
    borderRadius: 6,
    borderWidth: 1,
    color: tokens.color.text,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  title: { color: tokens.color.text, fontSize: 28, fontWeight: '700' },
});
