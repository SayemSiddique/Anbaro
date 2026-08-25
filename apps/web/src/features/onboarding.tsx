'use client';

import { Building2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { AnbaroMark } from '../components/brand';
import { Button, Card, CardIntro, Field, InlineError, Input, Meta, Select } from '../components/ui';
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
      <div className="stack">
        <CardIntro
          icon={<AnbaroMark size={44} />}
          id="organization-title"
          title="Create your organization"
        >
          <Meta>
            You’ll be the Owner. Anbaro is free, with unlimited locations and items — invite your
            team once the first location is set up.
          </Meta>
        </CardIntro>
        <form className="form-row" onSubmit={submit}>
          <Field grow label="Organization name">
            <Input name="name" placeholder="e.g. Harbor Trading Co." required />
          </Field>
          <Button icon={<Building2 size={16} />} loading={working} type="submit">
            Continue
          </Button>
        </form>
        {error ? <InlineError detail={error} title="Couldn’t create your organization" /> : null}
      </div>
    </Card>
  );
}

export function OrganizationSwitcher() {
  const { api, reload, state } = useSession();
  if (state.kind !== 'ready') return null;
  return (
    <Select
      aria-label="Active organization"
      compact
      onChange={async (event) => {
        await api.selectActiveOrganization({ organizationId: event.target.value });
        await reload();
      }}
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
