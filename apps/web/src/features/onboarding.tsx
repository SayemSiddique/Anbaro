'use client';

import { Building2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { AnbaroMark } from '../components/brand';
import { Button, Card, Field, Input, Select } from '../components/ui';
import { apiErrorMessage, useSession } from '../lib/session';

export function OrganizationSetup() {
  const { api, reload } = useSession();
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError('');
    try {
      await api.createOrganization({ name: String(new FormData(event.currentTarget).get('name')) });
      await reload();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setWorking(false);
    }
  }
  return (
    <Card labelledBy="organization-title">
      <div style={{ display: 'grid', gap: 8, justifyItems: 'center', textAlign: 'center' }}>
        <AnbaroMark size={44} />
        <h1 id="organization-title">Create your organization</h1>
        <p style={{ color: 'var(--text-muted)', maxWidth: 400 }}>
          You’ll be the Owner. Anbaro is free, with unlimited locations and items — invite your
          team once the first location is set up.
        </p>
      </div>
      <form className="form-row" onSubmit={submit} style={{ marginTop: 20 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <Field label="Organization name">
            <Input name="name" placeholder="e.g. Harbor Trading Co." required />
          </Field>
        </div>
        <Button icon={<Building2 size={16} />} loading={working} type="submit">
          Continue
        </Button>
      </form>
      {error ? (
        <p role="alert" style={{ color: 'var(--danger)', marginTop: 10 }}>
          {error}
        </p>
      ) : null}
    </Card>
  );
}

export function OrganizationSwitcher() {
  const { api, reload, state } = useSession();
  if (state.kind !== 'ready') return null;
  return (
    <Select
      aria-label="Active organization"
      onChange={async (event) => {
        await api.selectActiveOrganization({ organizationId: event.target.value });
        await reload();
      }}
      style={{ maxWidth: 260, minHeight: 38 }}
      value={state.user.activeOrganizationId ?? ''}
    >
      {state.user.memberships.map((membership) => (
        <option key={membership.organizationId} value={membership.organizationId}>
          {membership.organizationName}
        </option>
      ))}
    </Select>
  );
}
