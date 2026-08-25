import type { CurrentUser } from '@anbaro/contracts';
import { ApiClientError } from '@anbaro/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Text, TextInput, View } from 'react-native';

import { MobileSessionController } from '../lib/session';
import { AnbaroWordmark } from './brand';
import { LoadingPanel, PrimaryButton, SecondaryButton, StatePanel } from './ui';
import { makeStyles, text } from '../lib/theme';

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
  const styles = useStyles();
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

  /**
   * Coming back from the background revalidates the session *behind* whatever
   * is on screen. It must never pass through `loading`: that swaps `children`
   * for a panel, which unmounts every screen below it, and a half-finished
   * count loses its place, its entry, and its position in the item list.
   *
   * A failure is left alone on purpose. Resuming with no signal is ordinary in
   * a stockroom, and the offline queue already holds the writes — dropping to
   * the error panel would throw away a working screen over a blip. Only a
   * genuine sign-out (no user) changes what is rendered.
   */
  const revalidate = useCallback(async () => {
    try {
      const user = await controller.bootstrap();
      setState(user ? { kind: 'ready', user } : { kind: 'signed-out' });
    } catch {
      // Keep the screen that is already working.
    }
  }, [controller]);

  useEffect(() => {
    void bootstrap();
    // iOS reports 'inactive' → 'active' for a pulled-down notification shade or
    // a permission dialog — including the camera prompt the count loop raises.
    // Only a real return from 'background' is worth a round trip.
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const returned = previous === 'background' && nextState === 'active';
      previous = nextState;
      if (returned) void revalidate();
    });
    return () => subscription.remove();
  }, [bootstrap, revalidate]);
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
  const styles = useStyles();
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
        <AnbaroWordmark size={44} />
        <Text style={styles.tagline}>Inventory that adds up.</Text>
      </View>
      <Text accessibilityRole="header" style={styles.title}>
        {mode === 'sign-up' ? 'Create your free account' : 'Welcome back'}
      </Text>
      <Text style={styles.detail}>
        {mode === 'sign-up'
          ? 'No card is required. Create your organization and first location next.'
          : 'Sign in to your Anbaro workspace.'}
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
        {mode === 'sign-up' ? 'I already have an account' : 'New to Anbaro? Create a free account'}
      </SecondaryButton>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  brand: { alignItems: 'center', gap: 8, marginBottom: 16 },
  container: {
    backgroundColor: c.ground,
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  detail: { ...text.body, color: c.inkMuted },
  error: { color: c.bad },
  form: { gap: 12, marginHorizontal: 'auto', maxWidth: 480, width: '100%' },
  tagline: { ...text.body, color: c.inkMuted },
  input: {
    ...text.body,
    backgroundColor: c.surface,
    borderColor: c.hairlineFirm,
    borderRadius: 6,
    borderWidth: 1,
    color: c.ink,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  title: { ...text.display, color: c.ink },
}));
