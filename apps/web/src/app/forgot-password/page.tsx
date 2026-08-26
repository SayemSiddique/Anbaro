'use client';

import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';

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
          <div className="stack">
            <CardIntro icon={<AnbaroWordmark size={30} />} title="Reset your password">
              <Meta>Enter your email and we’ll send a link to set a new password.</Meta>
            </CardIntro>
            {sent ? (
              <p role="status">
                If an account exists for that email, a reset link is on its way. The link expires in
                an hour.
              </p>
            ) : (
              <FormSection onSubmit={submit} standalone>
                <Field label="Email">
                  <Input autoComplete="email" name="email" required type="email" />
                </Field>
                {error ? <InlineError detail={error} title="Couldn’t send that link" /> : null}
                <Button loading={working} type="submit">
                  Send reset link
                </Button>
              </FormSection>
            )}
            <div className="auth-actions">
              <Link className="btn btn-ghost btn-sm" href="/login">
                Back to sign in
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}
