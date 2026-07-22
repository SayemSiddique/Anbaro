'use client';

import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';

import { AnbaroWordmark } from '../../components/brand';
import { Button, Card, Field, Input } from '../../components/ui';
import { apiErrorMessage, createSessionApi } from '../../lib/session';

export default function ForgotPasswordPage() {
  const api = useMemo(() => createSessionApi(), []);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setWorking(true);
    const form = new FormData(event.currentTarget);
    try {
      await api.requestPasswordReset({ email: String(form.get('email')) });
      setSent(true);
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
            <h1>Reset your password</h1>
            <p style={{ color: 'var(--text-muted)' }}>
              Enter your email and we’ll send a link to set a new password.
            </p>
          </div>
          {sent ? (
            <p role="status">
              If an account exists for that email, a reset link is on its way. The link expires in
              an hour.
            </p>
          ) : (
            <form className="form-grid" onSubmit={submit} style={{ maxWidth: 'none' }}>
              <Field label="Email">
                <Input autoComplete="email" name="email" required type="email" />
              </Field>
              {error ? (
                <p role="alert" style={{ color: 'var(--danger)', margin: 0 }}>
                  {error}
                </p>
              ) : null}
              <Button loading={working} type="submit">
                Send reset link
              </Button>
            </form>
          )}
          <p style={{ marginTop: 16, textAlign: 'center' }}>
            <Link className="btn btn-ghost btn-sm" href="/login">
              Back to sign in
            </Link>
          </p>
        </Card>
      </div>
    </main>
  );
}
