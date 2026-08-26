'use client';

import type {
  ActivityEvent,
  Location,
  LossByReason,
  MembershipInvitation,
  PermissionGrantSet,
  TeamMembership,
} from '@anbaro/contracts';
import { BarChart3, UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  Actions,
  AsyncPanel,
  Badge,
  Button,
  Card,
  CardTitle,
  Checkbox,
  type Column,
  DataTable,
  Dialog,
  Field,
  FormSection,
  InlineError,
  Input,
  Meta,
  type SavedView,
  SkeletonList,
  SkeletonTable,
  Select,
  Switch,
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

const channelLabels: Record<string, string> = {
  in_app: 'In-app',
  email: 'Email',
  push: 'Push',
};

function decimal(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : value;
}

const lossColumns: Column<LossByReason>[] = [
  {
    id: 'reason',
    header: 'Reason',
    cell: (loss) => <span className="compact-strong">{loss.reasonCode}</span>,
    sortValue: (loss) => loss.reasonCode,
  },
  {
    id: 'events',
    header: 'Events',
    align: 'end',
    numeric: true,
    cell: (loss) => loss.eventCount,
    sortValue: (loss) => loss.eventCount,
  },
  {
    id: 'quantity',
    header: 'Quantity lost',
    align: 'end',
    numeric: true,
    cell: (loss) => decimal(loss.quantityLost),
    sortValue: (loss) => Number.parseFloat(loss.quantityLost) || 0,
  },
];

const activityColumns: Column<ActivityEvent>[] = [
  {
    id: 'when',
    header: 'When',
    cell: (event) => new Date(event.createdAt).toLocaleString(),
    sortValue: (event) => event.createdAt,
  },
  {
    id: 'action',
    header: 'Action',
    cell: (event) => <span className="compact-strong">{event.action.replaceAll('_', ' ')}</span>,
    sortValue: (event) => event.action,
  },
  {
    id: 'subject',
    header: 'Subject',
    cell: (event) => (
      <div>
        {event.subject}
        {event.locationName ? <Meta>at {event.locationName}</Meta> : null}
      </div>
    ),
    sortValue: (event) => event.subject,
  },
  {
    id: 'actor',
    header: 'Who',
    cell: (event) => event.actorName ?? <Meta inline>System</Meta>,
    sortValue: (event) => event.actorName ?? '',
  },
];

/* Newest first in every view: an audit log is read from the top, and the row
   someone is looking for is almost always the one that just happened. The two
   halves are worth separating — "who changed stock" and "who changed access"
   are different questions asked by different people. */
const newestFirst = { columnId: 'when', direction: 'descending' } as const;
const activityViews: SavedView<ActivityEvent>[] = [
  { id: 'all', label: 'All', sort: newestFirst },
  {
    id: 'stock',
    label: 'Stock ledger',
    predicate: (event) => event.type === 'stock_event',
    sort: newestFirst,
  },
  {
    id: 'admin',
    label: 'Administration',
    predicate: (event) => event.type === 'administration',
    sort: newestFirst,
  },
];

export function ReportsFeature() {
  const { api } = useSession();
  const [losses, setLosses] = useState<LossByReason[]>([]);
  const [lossesLoaded, setLossesLoaded] = useState(false);
  const [lossesLoading, setLossesLoading] = useState(true);
  const [lossesError, setLossesError] = useState('');
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState('');

  // Two reports, two fetches, two retries. A dead audit query is no reason to
  // throw away the loss figures that arrived fine.
  const loadLosses = useCallback(async () => {
    setLossesLoading(true);
    setLossesError('');
    try {
      setLosses((await api.getLossByReason()).data);
      setLossesLoaded(true);
    } catch (caught) {
      setLossesError(apiErrorMessage(caught));
    } finally {
      setLossesLoading(false);
    }
  }, [api]);
  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    setActivityError('');
    try {
      setActivity((await api.getActivity()).data);
      setActivityLoaded(true);
    } catch (caught) {
      setActivityError(apiErrorMessage(caught));
    } finally {
      setActivityLoading(false);
    }
  }, [api]);
  useEffect(() => {
    void loadLosses();
    void loadActivity();
  }, [loadActivity, loadLosses]);

  return (
    <div className="stack">
      <Card labelledBy="loss-report">
        <CardTitle
          id="loss-report"
          subtitle="Loss totals come from the immutable stock ledger."
          title="Loss by reason"
        />
        <AsyncPanel
          error={lossesError || null}
          hasContent={lossesLoaded}
          loading={lossesLoading}
          loadingLabel="Loading the loss report"
          onRetry={() => void loadLosses()}
          skeleton={<SkeletonTable columns={3} rows={5} />}
        >
          <DataTable
            caption="Loss by reason"
            columns={lossColumns}
            emptyHint="No loss movements match this report."
            emptyIcon={<BarChart3 size={36} strokeWidth={1.5} />}
            countHidden
            emptyTitle="No recorded losses"
            getRowId={(loss) => loss.reasonCode}
            rows={losses}
          />
        </AsyncPanel>
      </Card>
      <Card labelledBy="activity-log">
        <CardTitle
          id="activity-log"
          subtitle="Ledger events combined with append-only administration records."
          title="Activity & audit history"
        />
        <AsyncPanel
          error={activityError || null}
          hasContent={activityLoaded}
          loading={activityLoading}
          loadingLabel="Loading activity history"
          onRetry={() => void loadActivity()}
          skeleton={<SkeletonTable columns={4} rows={8} />}
        >
          <DataTable
            caption="Activity & audit history"
            columns={activityColumns}
            emptyHint="Ledger and administration events appear here as they happen."
            emptyTitle="No operational activity yet"
            getRowId={(event) => `${event.type}-${event.id}`}
            rows={activity}
            searchPlaceholder="Action, subject, or person"
            searchValue={(event) =>
              `${event.action} ${event.subject} ${event.actorName ?? ''} ${event.locationName ?? ''}`
            }
            views={activityViews}
          />
        </AsyncPanel>
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
  const [locations, setLocations] = useState<Location[]>([]);
  const [inviteAllLocations, setInviteAllLocations] = useState(true);
  const [inviteLocationIds, setInviteLocationIds] = useState<string[]>([]);
  // The Checkbox primitive is controlled and carries no `name`, so the custom
  // permission set is composed in state rather than read back off the form.
  const [grantPermissions, setGrantPermissions] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [invitationToken, setInvitationToken] = useState('');
  const locationName = useCallback(
    (id: string) => locations.find((location) => location.id === id)?.name ?? 'Unknown location',
    [locations],
  );
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [memberResponse, invitationResponse, grantResponse, locationResponse] =
        await Promise.all([
          api.getMemberships(),
          api.getMembershipInvitations(),
          api.getPermissionGrantSets(),
          api.getLocations(),
        ]);
      setMembers(memberResponse.data);
      setInvitations(invitationResponse.data);
      setGrantSets(grantResponse.data);
      setLocations(locationResponse.data);
      setLoaded(true);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);

  function toggleInviteLocation(id: string) {
    setInviteLocationIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (!inviteAllLocations && inviteLocationIds.length === 0) {
      setFormError('Assign at least one location, or grant access to all locations.');
      return;
    }
    try {
      const result = await api.createMembershipInvitation({
        email: String(form.get('email')),
        name: String(form.get('name')) || null,
        grantSetId: String(form.get('grantSetId')),
        allLocations: inviteAllLocations,
        ...(inviteAllLocations ? {} : { locationIds: inviteLocationIds }),
      });
      // The acceptance token is shown once and never again, so it gets a modal
      // rather than a banner above a page someone is about to scroll.
      setInvitationToken(result.data.acceptanceToken);
      formElement.reset();
      setInviteAllLocations(true);
      setInviteLocationIds([]);
      await load();
    } catch (caught) {
      setFormError(apiErrorMessage(caught));
    }
  }
  async function createGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setFormError('');
    try {
      await api.createPermissionGrantSet({
        name: String(form.get('grantName')),
        permissions: grantPermissions,
      });
      formElement.reset();
      setGrantPermissions([]);
      await load();
    } catch (caught) {
      setFormError(apiErrorMessage(caught));
    }
  }

  const memberColumns: Column<TeamMembership>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (member) => (
        <div>
          <span className="compact-strong">{member.name}</span>
          <Meta>{member.email}</Meta>
        </div>
      ),
      sortValue: (member) => member.name,
    },
    {
      id: 'grantSet',
      header: 'Permission set',
      cell: (member) => member.grantSetName,
      sortValue: (member) => member.grantSetName,
    },
    {
      id: 'locations',
      header: 'Locations',
      cell: (member) =>
        member.allLocations
          ? 'All locations'
          : member.locationIds.map(locationName).join(', ') || <Meta inline>None</Meta>,
    },
    {
      id: 'status',
      header: 'Status',
      cell: (member) => (
        <Badge tone={member.status === 'active' ? 'success' : 'neutral'} withDot>
          {member.status}
        </Badge>
      ),
      sortValue: (member) => member.status,
    },
  ];

  const invitationColumns: Column<MembershipInvitation>[] = [
    {
      id: 'email',
      header: 'Invited',
      cell: (invitation) => (
        <div>
          <span className="compact-strong">{invitation.email}</span>
          <Meta>{invitation.grantSetName}</Meta>
        </div>
      ),
      sortValue: (invitation) => invitation.email,
    },
    {
      id: 'locations',
      header: 'Locations',
      cell: (invitation) =>
        invitation.allLocations
          ? 'All locations'
          : invitation.locationIds.map(locationName).join(', ') || <Meta inline>None</Meta>,
    },
    {
      id: 'expires',
      header: 'Expires',
      cell: (invitation) => new Date(invitation.expiresAt).toLocaleDateString(),
      sortValue: (invitation) => invitation.expiresAt,
    },
    {
      id: 'status',
      header: 'Status',
      cell: (invitation) => (
        <Badge tone={invitation.status === 'pending' ? 'info' : 'neutral'} withDot>
          {invitation.status}
        </Badge>
      ),
      sortValue: (invitation) => invitation.status,
    },
  ];

  return (
    <div className="stack">
      <Card labelledBy="team-members">
        <CardTitle
          id="team-members"
          subtitle="Permissions are always enforced by the API, not the interface."
          title="Active team"
        />
        <AsyncPanel
          error={error || null}
          hasContent={loaded}
          loading={loading}
          loadingLabel="Loading the team"
          onRetry={() => void load()}
          skeleton={<SkeletonTable columns={4} rows={4} />}
        >
          <DataTable
            caption="Active team"
            columns={memberColumns}
            emptyHint="Invite helpers with a preset or an approved custom permission set."
            emptyIcon={<Users size={36} strokeWidth={1.5} />}
            emptyTitle="Just you so far"
            getRowId={(member) => member.id}
            rows={members}
            searchPlaceholder="Name, email, or permission set"
            searchValue={(member) => `${member.name} ${member.email} ${member.grantSetName}`}
          />
        </AsyncPanel>
      </Card>

      <Card labelledBy="invite-helper">
        <CardTitle id="invite-helper" title="Invite helper" />
        {formError ? (
          <div className="inline-error-stacked">
            <InlineError detail={formError} title="Couldn’t save that" />
          </div>
        ) : null}
        <FormSection onSubmit={invite} standalone>
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
          {/* A fieldset, not a Field: a group of checkboxes needs a legend, and
              a `<label>` wrapping other labels is neither valid nor clickable. */}
          <fieldset className="fieldset">
            <legend>Location access</legend>
            <Meta>
              Managers see every location. Scope a helper to only the locations they work in.
            </Meta>
            <Checkbox
              checked={inviteAllLocations}
              label="All locations"
              onChange={setInviteAllLocations}
            />
            {!inviteAllLocations ? (
              <div className="checkbox-grid">
                {locations.length === 0 ? (
                  <Meta inline>No locations yet.</Meta>
                ) : (
                  locations.map((location) => (
                    <Checkbox
                      checked={inviteLocationIds.includes(location.id)}
                      key={location.id}
                      label={location.name}
                      onChange={() => toggleInviteLocation(location.id)}
                    />
                  ))
                )}
              </div>
            ) : null}
          </fieldset>
          <Actions>
            <Button icon={<UserPlus size={15} />} type="submit">
              Send invite
            </Button>
          </Actions>
        </FormSection>
      </Card>

      <Card labelledBy="pending-invitations">
        <CardTitle id="pending-invitations" title="Invitations" />
        <AsyncPanel
          error={error || null}
          hasContent={loaded}
          loading={loading}
          loadingLabel="Loading invitations"
          onRetry={() => void load()}
          skeleton={<SkeletonList rows={3} />}
        >
          <DataTable
            caption="Invitations"
            columns={invitationColumns}
            countHidden
            emptyHint="An invitation appears here until it is accepted or expires."
            emptyIcon={<UserPlus size={36} strokeWidth={1.5} />}
            emptyTitle="No invitations yet"
            getRowId={(invitation) => invitation.id}
            rows={invitations}
          />
        </AsyncPanel>
      </Card>

      {canManageGrants ? (
        <Card labelledBy="custom-grants">
          <CardTitle
            id="custom-grants"
            subtitle="Compose a custom permission set for specialized roles."
            title="Custom permission sets"
          />
          <FormSection onSubmit={createGrant} standalone wide>
            <div className="form-row">
              <Field grow label="Name">
                <Input name="grantName" required />
              </Field>
            </div>
            <fieldset className="fieldset">
              <legend>Permissions</legend>
              <div className="checkbox-grid">
                {grantOptions.map((permission) => (
                  <Checkbox
                    checked={grantPermissions.includes(permission)}
                    key={permission}
                    label={permission}
                    onChange={(next) =>
                      setGrantPermissions((current) =>
                        next
                          ? [...current, permission]
                          : current.filter((value) => value !== permission),
                      )
                    }
                  />
                ))}
              </div>
            </fieldset>
            <Actions>
              <Button tone="secondary" type="submit">
                Save custom set
              </Button>
            </Actions>
          </FormSection>
        </Card>
      ) : null}

      <Dialog
        description="It is shown once. Copy it now — reopening this screen will not bring it back."
        footer={
          <Actions>
            <Button onClick={() => setInvitationToken('')}>Done</Button>
          </Actions>
        }
        onClose={() => setInvitationToken('')}
        open={invitationToken !== ''}
        title="Invitation ready"
      >
        <p>Share this one-time acceptance token with your helper securely:</p>
        <p className="token-readout">{invitationToken}</p>
      </Dialog>
    </div>
  );
}

export function SettingsFeature() {
  const { api, reload, state } = useSession();
  const [name, setName] = useState('');
  const [channels, setChannels] = useState<
    { channel: 'in_app' | 'email' | 'push'; enabled: boolean }[]
  >([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [organization, preferences] = await Promise.all([
        api.getActiveOrganization(),
        api.getNotificationPreferences(),
      ]);
      setName(organization.data.name);
      setChannels(preferences.data);
      setLoaded(true);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError('');
    try {
      await api.updateActiveOrganization({ name });
      await reload();
    } catch (caught) {
      setSaveError(apiErrorMessage(caught));
    }
  }
  async function toggle(channel: 'in_app' | 'email' | 'push', enabled: boolean) {
    setSaving(channel);
    setSaveError('');
    try {
      await api.updateNotificationPreference({ channel, enabled });
      await load();
    } catch (caught) {
      setSaveError(apiErrorMessage(caught));
    } finally {
      setSaving('');
    }
  }

  return (
    <div className="stack">
      <Card labelledBy="organization-settings">
        <CardTitle id="organization-settings" title="Organization" />
        <AsyncPanel
          error={error || null}
          hasContent={loaded}
          loading={loading}
          loadingLabel="Loading settings"
          onRetry={() => void load()}
          skeleton={<SkeletonList rows={1} />}
        >
          <FormSection onSubmit={saveName} standalone>
            <Field label="Organization name">
              <Input onChange={(event) => setName(event.target.value)} required value={name} />
            </Field>
            <Actions>
              <Button type="submit">Save name</Button>
            </Actions>
          </FormSection>
        </AsyncPanel>
      </Card>
      <Card labelledBy="notification-settings">
        <CardTitle
          id="notification-settings"
          subtitle="Choose how you receive low-stock alerts. SMS is not available."
          title="Low-stock notifications"
        />
        <AsyncPanel
          error={error || null}
          hasContent={loaded}
          loading={loading}
          loadingLabel="Loading notification preferences"
          onRetry={() => void load()}
          skeleton={<SkeletonList rows={3} />}
        >
          <ul className="list-plain">
            {channels.map((preference) => {
              const label = channelLabels[preference.channel] ?? preference.channel;
              return (
                <li className="list-row" key={preference.channel}>
                  <strong>{label}</strong>
                  <Switch
                    checked={preference.enabled}
                    disabled={saving === preference.channel}
                    label={`${label} alerts`}
                    labelHidden
                    onChange={(next) => void toggle(preference.channel, next)}
                  />
                </li>
              );
            })}
          </ul>
        </AsyncPanel>
      </Card>
      {saveError ? (
        <div className="inline-error-stacked">
          <InlineError detail={saveError} title="Couldn’t save that change" />
        </div>
      ) : null}
      <Card labelledBy="account-settings">
        <CardTitle id="account-settings" title="Signed-in account" />
        <Meta>{state.kind === 'ready' ? state.user.name : ''}</Meta>
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
        <FormSection onSubmit={remove} standalone>
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
          {error ? <InlineError detail={error} title="Couldn’t delete your account" /> : null}
          <Actions>
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
          </Actions>
        </FormSection>
      ) : (
        <Button onClick={() => setOpen(true)} tone="secondary" type="button">
          Delete account
        </Button>
      )}
    </Card>
  );
}
