'use client';

import type {
  ActivityEvent,
  LossByReason,
  MembershipInvitation,
  PermissionGrantSet,
  TeamMembership,
} from '@anbaro/contracts';
import { BarChart3, UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  Field,
  Input,
  Select,
  StatePanel,
} from '../components/ui';
import { apiErrorMessage, useSession } from '../lib/session';

const grantOptions = [
  'dashboard:read',
  'location:read',
  'location:write',
  'location:archive',
  'organization:read',
  'item:read',
  'item:write',
  'item:archive',
  'stock:read',
  'stock:write',
  'count:read',
  'count:write',
  'count:finalize',
  'supplier:manage',
  'reorder:read',
  'notification:read',
  'reports:read',
  'audit:read',
  'settings:read',
  'user:manage',
];

export function ReportsFeature() {
  const { api } = useSession();
  const [losses, setLosses] = useState<LossByReason[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      const [lossResponse, activityResponse] = await Promise.all([
        api.getLossByReason(),
        api.getActivity(),
      ]);
      setLosses(lossResponse.data);
      setActivity(activityResponse.data);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }, [api]);
  useEffect(() => void load(), [load]);

  if (error)
    return (
      <StatePanel
        action={<Button onClick={() => void load()}>Try again</Button>}
        title="Couldn’t load reports"
        tone="error"
      >
        {error}
      </StatePanel>
    );
  return (
    <div className="stack">
      <Card labelledBy="loss-report">
        <CardTitle
          id="loss-report"
          subtitle="Loss totals come from the immutable stock ledger."
          title="Loss by reason"
        />
        {losses.length === 0 ? (
          <EmptyState
            hint="No loss movements match this report."
            icon={<BarChart3 size={36} strokeWidth={1.5} />}
            title="No recorded losses"
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Reason</th>
                  <th>Events</th>
                  <th>Quantity lost</th>
                </tr>
              </thead>
              <tbody>
                {losses.map((loss) => (
                  <tr key={loss.reasonCode}>
                    <td style={{ fontWeight: 600 }}>{loss.reasonCode}</td>
                    <td>{loss.eventCount}</td>
                    <td>{loss.quantityLost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card labelledBy="activity-log">
        <CardTitle
          id="activity-log"
          subtitle="Ledger events combined with append-only administration records."
          title="Activity & audit history"
        />
        {activity.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No operational activity recorded yet.</p>
        ) : (
          <ol style={{ display: 'grid', gap: 12, margin: 0, paddingLeft: 20 }}>
            {activity.map((event) => (
              <li key={`${event.type}-${event.id}`}>
                <strong>{event.action.replaceAll('_', ' ')}</strong> — {event.subject}
                {event.locationName ? ` at ${event.locationName}` : ''}
                <br />
                <small>
                  {event.actorName ?? 'System'} · {new Date(event.createdAt).toLocaleString()}
                </small>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

export function TeamFeature() {
  const { api, permissions } = useSession();
  const canManageGrants = permissions.has('grant:manage');
  const [members, setMembers] = useState<TeamMembership[]>([]);
  const [invitations, setInvitations] = useState<MembershipInvitation[]>([]);
  const [grantSets, setGrantSets] = useState<PermissionGrantSet[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      const [memberResponse, invitationResponse, grantResponse] = await Promise.all([
        api.getMemberships(),
        api.getMembershipInvitations(),
        api.getPermissionGrantSets(),
      ]);
      setMembers(memberResponse.data);
      setInvitations(invitationResponse.data);
      setGrantSets(grantResponse.data);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }, [api]);
  useEffect(() => void load(), [load]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const result = await api.createMembershipInvitation({
        email: String(form.get('email')),
        name: String(form.get('name')) || null,
        grantSetId: String(form.get('grantSetId')),
      });
      setNotice(
        `Invitation created. Share this one-time acceptance token securely: ${result.data.acceptanceToken}`,
      );
      formElement.reset();
      await load();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }
  async function createGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const selected = grantOptions.filter((permission) => form.get(permission) === 'on');
    try {
      await api.createPermissionGrantSet({
        name: String(form.get('grantName')),
        permissions: selected,
      });
      formElement.reset();
      await load();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }

  if (error)
    return (
      <StatePanel
        action={<Button onClick={() => void load()}>Try again</Button>}
        title="Couldn’t load the team"
        tone="error"
      >
        {error}
      </StatePanel>
    );
  return (
    <div className="stack">
      {notice ? <StatePanel title="Invitation ready">{notice}</StatePanel> : null}
      <Card labelledBy="team-members">
        <CardTitle
          id="team-members"
          subtitle="Permissions are always enforced by the API, not the interface."
          title="Active team"
        />
        {members.length === 0 ? (
          <EmptyState
            hint="Invite helpers with a preset or an approved custom permission set."
            icon={<Users size={36} strokeWidth={1.5} />}
            title="Just you so far"
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Permission set</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id}>
                    <td style={{ fontWeight: 600 }}>{member.name}</td>
                    <td>{member.email}</td>
                    <td>{member.grantSetName}</td>
                    <td>
                      <Badge tone={member.status === 'active' ? 'success' : 'neutral'} withDot>
                        {member.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card labelledBy="invite-helper">
        <CardTitle id="invite-helper" title="Invite helper" />
        <form className="form-grid" onSubmit={invite}>
          <Field label="Email">
            <Input name="email" required type="email" />
          </Field>
          <Field hint="Optional" label="Name">
            <Input name="name" />
          </Field>
          <Field label="Permission set">
            <Select defaultValue="20000000-0000-4000-8000-000000000003" name="grantSetId">
              {grantSets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.name}
                  {set.scope === 'organization' ? ' (Custom)' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <div>
            <Button icon={<UserPlus size={15} />} type="submit">
              Send invite
            </Button>
          </div>
        </form>
      </Card>
      <Card labelledBy="pending-invitations">
        <CardTitle id="pending-invitations" title="Invitations" />
        {invitations.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No invitations yet.</p>
        ) : (
          <ul className="list-plain">
            {invitations.map((invitation) => (
              <li className="list-row" key={invitation.id}>
                <div>
                  <strong>{invitation.email}</strong>
                  <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    {invitation.grantSetName} · expires{' '}
                    {new Date(invitation.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <Badge tone={invitation.status === 'pending' ? 'info' : 'neutral'}>
                  {invitation.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {canManageGrants ? (
        <Card labelledBy="custom-grants">
          <CardTitle
            id="custom-grants"
            subtitle="Compose a custom permission set for specialized roles."
            title="Custom permission sets"
          />
          <form className="form-grid" onSubmit={createGrant} style={{ maxWidth: 'none' }}>
            <Field label="Name">
              <Input name="grantName" required style={{ maxWidth: 360 }} />
            </Field>
            <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
              <legend style={{ fontWeight: 600, padding: '0 6px' }}>Permissions</legend>
              <div
                style={{
                  display: 'grid',
                  gap: 8,
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                }}
              >
                {grantOptions.map((permission) => (
                  <label className="checkbox-row" key={permission}>
                    <input name={permission} type="checkbox" /> {permission}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <Button type="submit">Save custom set</Button>
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}

export function SettingsFeature() {
  const { api, reload, state } = useSession();
  const [name, setName] = useState('');
  const [channels, setChannels] = useState<
    { channel: 'in_app' | 'email' | 'push'; enabled: boolean }[]
  >([]);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const [organization, preferences] = await Promise.all([
        api.getActiveOrganization(),
        api.getNotificationPreferences(),
      ]);
      setName(organization.data.name);
      setChannels(preferences.data);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }, [api]);
  useEffect(() => void load(), [load]);

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await api.updateActiveOrganization({ name });
      await reload();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }
  async function toggle(channel: 'in_app' | 'email' | 'push', enabled: boolean) {
    try {
      await api.updateNotificationPreference({ channel, enabled });
      await load();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }

  if (error)
    return (
      <StatePanel
        action={<Button onClick={() => void load()}>Try again</Button>}
        title="Couldn’t load settings"
        tone="error"
      >
        {error}
      </StatePanel>
    );
  return (
    <div className="stack">
      <Card labelledBy="organization-settings">
        <CardTitle id="organization-settings" title="Organization" />
        <form className="form-grid" onSubmit={saveName}>
          <Field label="Organization name">
            <Input onChange={(event) => setName(event.target.value)} required value={name} />
          </Field>
          <div>
            <Button type="submit">Save name</Button>
          </div>
        </form>
      </Card>
      <Card labelledBy="notification-settings">
        <CardTitle
          id="notification-settings"
          subtitle="Choose how you receive low-stock alerts. SMS is not available."
          title="Low-stock notifications"
        />
        {channels.map((preference) => (
          <label className="checkbox-row" key={preference.channel} style={{ margin: '10px 0' }}>
            <input
              checked={preference.enabled}
              onChange={(event) => void toggle(preference.channel, event.target.checked)}
              type="checkbox"
            />{' '}
            {preference.channel.replace('_', '-')}
          </label>
        ))}
      </Card>
      <Card labelledBy="account-settings">
        <CardTitle id="account-settings" title="Signed-in account" />
        <p>{state.kind === 'ready' ? state.user.name : ''}</p>
      </Card>
      <DeleteAccountCard />
    </div>
  );
}

/**
 * Account deletion must be reachable in-app to satisfy App Store guideline
 * 5.1.1(v), and the same path serves GDPR erasure on web. Deleting an owner
 * deletes their workspaces outright, so the confirmation is deliberately heavy:
 * password re-entry plus typing DELETE.
 */
function DeleteAccountCard() {
  const { api, signOut, state } = useSession();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const email = state.kind === 'ready' ? state.user.email : '';

  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.deleteAccount({ email, password });
      // The account is gone; clear local session state and return to the login screen.
      await signOut();
    } catch (caught) {
      setError(apiErrorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <Card labelledBy="delete-account">
      <CardTitle
        id="delete-account"
        subtitle="Permanently deletes your account. Every workspace you own is deleted with it, including all items, counts, and history. This cannot be undone."
        title="Delete account"
      />
      {open ? (
        <form className="form-grid" onSubmit={remove}>
          <Field label="Confirm your password">
            <Input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </Field>
          <Field label="Type DELETE to confirm">
            <Input
              onChange={(event) => setConfirmation(event.target.value)}
              required
              value={confirmation}
            />
          </Field>
          {error ? <p role="alert">{error}</p> : null}
          <div className="row" style={{ display: 'flex', gap: 8 }}>
            <Button
              disabled={confirmation !== 'DELETE' || !password}
              loading={busy}
              tone="danger"
              type="submit"
            >
              Permanently delete my account
            </Button>
            <Button onClick={() => setOpen(false)} tone="secondary" type="button">
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button onClick={() => setOpen(true)} tone="secondary" type="button">
          Delete account
        </Button>
      )}
    </Card>
  );
}
