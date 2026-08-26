'use client';

import { BarChart3, CheckCircle2, ClipboardCheck, ShieldCheck } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState, type FormEvent } from 'react';

import { AnbaroWordmark } from '../../components/brand';
import {
  Button,
  Card,
  CardIntro,
  Field,
  FormSection,
  InlineError,
  Input,
  Meta,
} from '../../components/ui';
import { apiErrorMessage, createSessionApi } from '../../lib/session';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const api = useMemo(() => createSessionApi(), []);
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>(
    searchParams.get('mode') === 'sign-up' ? 'sign-up' : 'sign-in',
  );
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setWorking(true);
    const form = new FormData(event.currentTarget);
    try {
      const email = String(form.get('email'));
      const password = String(form.get('password'));
      if (mode === 'sign-up')
        await api.register({ email, password, name: String(form.get('name')) });
      else await api.login({ email, password });
      router.replace('/dashboard');
    } catch (caught) {
      setError(apiErrorMessage(caught));
      setWorking(false);
    }
  }

  return (
    <div className="auth-frame">
      <aside aria-hidden="true" className="auth-hero">
        <AnbaroWordmark dark size={34} />
        <div>
          <p className="auth-hero-title">Inventory that adds up — across every location.</p>
          <ul className="auth-points">
            <li>
              <ClipboardCheck size={20} />
              <span>
                Guided counts with offline capture, conflict review, and one-step reconciliation.
              </span>
            </li>
            <li>
              <BarChart3 size={20} />
              <span>
                An immutable stock ledger: every quantity traces back to an attributed movement.
              </span>
            </li>
            <li>
              <CheckCircle2 size={20} />
              <span>Low-stock alerts and reorder suggestions tuned to your target levels.</span>
            </li>
            <li>
              <ShieldCheck size={20} />
              <span>Per-tenant isolation enforced in the database, not just the interface.</span>
            </li>
          </ul>
        </div>
        <small className="auth-hero-foot">Anbaro · stock management for operators</small>
      </aside>
      <main className="auth-panel">
        <div className="auth-card">
          <Card>
            <div className="stack">
              <CardIntro
                id="access-title"
                title={mode === 'sign-up' ? 'Create your free account' : 'Welcome back'}
              >
                <Meta>
                  {mode === 'sign-up'
                    ? 'No card required. Create your organization and first location next.'
                    : 'Sign in to your Anbaro workspace.'}
                </Meta>
              </CardIntro>
              <FormSection onSubmit={submit} standalone>
                {mode === 'sign-up' ? (
                  <Field label="Name">
                    <Input autoComplete="name" name="name" required />
                  </Field>
                ) : null}
                <Field label="Email">
                  <Input autoComplete="email" name="email" required type="email" />
                </Field>
                <Field
                  label="Password"
                  hint={mode === 'sign-up' ? 'At least 8 characters.' : undefined}
                >
                  <Input
                    autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                    minLength={8}
                    name="password"
                    required
                    type="password"
                  />
                </Field>
                {error ? (
                  <InlineError
                    detail={error}
                    title={
                      mode === 'sign-up' ? 'Couldn’t create your account' : 'Couldn’t sign you in'
                    }
                  />
                ) : null}
                <Button loading={working} type="submit">
                  {mode === 'sign-up' ? 'Create account' : 'Sign in'}
                </Button>
              </FormSection>
              <div className="auth-actions">
                {mode === 'sign-in' ? (
                  <a className="btn btn-ghost btn-sm" href="/forgot-password">
                    Forgot your password?
                  </a>
                ) : null}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setError('');
                    setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up');
                  }}
                  type="button"
                >
                  {mode === 'sign-up'
                    ? 'Already have an account? Sign in'
                    : 'New to Anbaro? Create a free account'}
                </button>
              </div>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
