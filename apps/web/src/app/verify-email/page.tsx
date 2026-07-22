'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';

import { AnbaroWordmark } from '../../components/brand';
import { Card } from '../../components/ui';
import { apiErrorMessage, createSessionApi } from '../../lib/session';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmail />
    </Suspense>
  );
}

function VerifyEmail() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const api = useMemo(() => createSessionApi(), []);
  const [status, setStatus] = useState<'working' | 'verified' | 'error'>('working');
  const [error, setError] = useState('');
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    if (!token) {
      setStatus('error');
      setError('This verification link is missing its token.');
      return;
    }
    api
      .verifyEmail({ token })
      .then(() => setStatus('verified'))
      .catch((caught) => {
        setStatus('error');
        setError(apiErrorMessage(caught));
      });
  }, [api, token]);

  return (
    <main className="auth-panel">
      <div className="auth-card">
        <Card>
          <div style={{ display: 'grid', gap: 6, marginBottom: 18 }}>
            <AnbaroWordmark size={30} />
            <h1>Email verification</h1>
          </div>
          {status === 'working' ? (
            <p role="status">Verifying your email…</p>
          ) : status === 'verified' ? (
            <p role="status">Your email is verified. Thanks for confirming.</p>
          ) : (
            <p role="alert" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          )}
          <p style={{ marginTop: 16, textAlign: 'center' }}>
            <Link className="btn btn-ghost btn-sm" href="/dashboard">
              Go to dashboard
            </Link>
          </p>
        </Card>
      </div>
    </main>
  );
}
