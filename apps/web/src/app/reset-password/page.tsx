'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState, type FormEvent } from 'react';

import { AnbaroWordmark } from '../../components/brand';
import { Button, Card, Field, Input } from '../../components/ui';
import { apiErrorMessage, createSessionApi } from '../../lib/session';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const api = useMemo(() => createSessionApi(), []);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [working, setWorking] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password'));
    if (password !== String(form.get('confirm'))) {
      setError('The two passwords don’t match.');
      return;
    }
    setWorking(true);
    try {
      await api.confirmPasswordReset({ token, password });
      setDone(true);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="auth-panel">
      <div className="auth-card">
        <Card>
          <div style={{ display: 'grid', gap: 6, marginBottom: 18 }}>
            <AnbaroWordmark size={30} />
            <h1>Choose a new password</h1>
          </div>
          {!token ? (
            <p role="alert" style={{ color: 'var(--danger)' }}>
              This reset link is missing its token. Request a new one.
            </p>
          ) : done ? (
            <div className="stack">
              <p role="status">Your password has been reset. You can sign in with it now.</p>
              <Button onClick={() => router.replace('/login')}>Go to sign in</Button>
            </div>
          ) : (
            <form className="form-grid" onSubmit={submit} style={{ maxWidth: 'none' }}>
              <Field hint="At least 8 characters." label="New password">
                <Input
                  autoComplete="new-password"
                  minLength={8}
                  name="password"
                  required
                  type="password"
                />
              </Field>
              <Field label="Confirm password">
                <Input
                  autoComplete="new-password"
                  minLength={8}
                  name="confirm"
                  required
                  type="password"
                />
              </Field>
              {error ? (
                <p role="alert" style={{ color: 'var(--danger)', margin: 0 }}>
                  {error}
                </p>
              ) : null}
              <Button loading={working} type="submit">
                Reset password
              </Button>
            </form>
          )}
          <p style={{ marginTop: 16, textAlign: 'center' }}>
            <Link className="btn btn-ghost btn-sm" href="/forgot-password">
              Request a new link
            </Link>
          </p>
        </Card>
      </div>
    </main>
  );
}
