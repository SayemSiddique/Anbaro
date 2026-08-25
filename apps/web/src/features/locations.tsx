'use client';

import { ApiClientError, type Location } from '@anbaro/contracts';
import { MapPin, Pencil, Plus } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  Actions,
  AsyncPanel,
  Badge,
  Button,
  Card,
  CardTitle,
  Dialog,
  EmptyState,
  Field,
  FormSection,
  InlineError,
  Input,
  Meta,
  SkeletonList,
} from '../components/ui';
import { apiErrorMessage, useSession } from '../lib/session';

export function LocationsFeature() {
  const { api, reload } = useSession();
  const [locations, setLocations] = useState<Location[]>([]);
  // capacity === null means unlimited (billing off, or a workspace on Pro).
  const [capacity, setCapacity] = useState<{ used: number; capacity: number | null }>({
    used: 0,
    capacity: null,
  });
  const [draft, setDraft] = useState({ name: '', address: '' });
  const [editing, setEditing] = useState<Location | null>(null);
  const [archiving, setArchiving] = useState<Location | null>(null);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [capacityPrompt, setCapacityPrompt] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadLocations = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      const response = await api.getLocations();
      setLocations(response.data);
      setCapacity({ used: response.meta.used, capacity: response.meta.capacity });
      setLoaded(true);
    } catch (caught) {
      setListError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  useEffect(() => {
    const saved = window.sessionStorage.getItem('stock.location-draft');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { name?: string; address?: string };
        setDraft({ name: parsed.name ?? '', address: parsed.address ?? '' });
      } catch {
        window.sessionStorage.removeItem('stock.location-draft');
      }
    }
  }, []);
  useEffect(() => {
    if (draft.name || draft.address)
      window.sessionStorage.setItem('stock.location-draft', JSON.stringify(draft));
    else window.sessionStorage.removeItem('stock.location-draft');
  }, [draft]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      await api.createLocation({ name: draft.name, address: draft.address || null });
      setDraft({ name: '', address: '' });
      await loadLocations();
      await reload();
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.code === 'LOCATION_CAPACITY_REACHED')
        setCapacityPrompt(true);
      else setError(apiErrorMessage(caught));
    }
  }
  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setError('');
    try {
      const form = new FormData(event.currentTarget);
      await api.updateLocation(editing.id, {
        name: String(form.get('name')),
        address: String(form.get('address')) || null,
      });
      setEditing(null);
      await loadLocations();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }
  async function archive() {
    if (!archiving) return;
    try {
      await api.archiveLocation(archiving.id);
      setArchiving(null);
      await loadLocations();
    } catch (caught) {
      setArchiving(null);
      setError(apiErrorMessage(caught));
    }
  }

  return (
    <div className="stack">
      <Card labelledBy="locations-title">
        <CardTitle
          action={
            <Badge
              tone={
                capacity.capacity !== null && capacity.used >= capacity.capacity
                  ? 'warning'
                  : 'neutral'
              }
            >
              {capacity.capacity === null
                ? `${capacity.used} active`
                : `${capacity.used} of ${capacity.capacity} used`}
            </Badge>
          }
          id="locations-title"
          subtitle="Each location keeps its own stock levels, counts, and alerts."
          title="Locations"
        />
        {/* The add-location form below stays usable even when the list fails to
            load, so the failure is scoped to the list rather than the card. */}
        <AsyncPanel
          error={listError || null}
          hasContent={loaded}
          loading={loading}
          loadingLabel="Loading locations"
          onRetry={() => void loadLocations()}
          skeleton={<SkeletonList rows={4} />}
        >
          {locations.length === 0 ? (
            <EmptyState
              hint="Your first location makes your workspace ready for inventory setup."
              icon={<MapPin size={36} strokeWidth={1.5} />}
              title="No locations yet"
            />
          ) : (
            <ul className="list-plain">
              {locations.map((location) => (
                <li className="list-row" key={location.id}>
                  <div>
                    <strong>{location.name}</strong>
                    {location.address ? <Meta>{location.address}</Meta> : null}
                  </div>
                  <Actions>
                    <Button
                      icon={<Pencil size={14} />}
                      onClick={() => setEditing(location)}
                      size="sm"
                      tone="secondary"
                    >
                      Edit
                    </Button>
                    <Button onClick={() => setArchiving(location)} size="sm" tone="danger">
                      Archive
                    </Button>
                  </Actions>
                </li>
              ))}
            </ul>
          )}
        </AsyncPanel>
        <FormSection
          onSubmit={create}
          title={locations.length ? 'Add another location' : 'Add your first location'}
        >
          <Field label="Name">
            <Input
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              required
              value={draft.name}
            />
          </Field>
          <Field hint="Optional" label="Address">
            <Input
              onChange={(event) => setDraft({ ...draft, address: event.target.value })}
              value={draft.address}
            />
          </Field>
          <div>
            <Button icon={<Plus size={16} />} type="submit">
              Save location
            </Button>
          </div>
        </FormSection>
        {error ? (
          <div className="inline-error-stacked">
            <InlineError detail={error} title="Couldn’t save that change" />
          </div>
        ) : null}
      </Card>

      <Dialog
        description="Renaming a location does not affect its stock, counts, or history."
        footer={
          <Actions>
            <Button form="edit-location-form" type="submit">
              Save changes
            </Button>
            <Button onClick={() => setEditing(null)} tone="secondary" type="button">
              Cancel
            </Button>
          </Actions>
        }
        onClose={() => setEditing(null)}
        open={editing !== null}
        title={editing ? `Edit ${editing.name}` : 'Edit location'}
      >
        {editing ? (
          <form className="form-grid" id="edit-location-form" onSubmit={saveEdit}>
            <Field label="Name">
              <Input defaultValue={editing.name} name="name" required />
            </Field>
            <Field hint="Optional" label="Address">
              <Input defaultValue={editing.address ?? ''} name="address" />
            </Field>
          </form>
        ) : null}
      </Dialog>

      <Dialog
        description="History stays available, and the location stops appearing in counts and alerts."
        footer={
          <Actions>
            <Button onClick={() => void archive()} tone="danger">
              Archive location
            </Button>
            <Button onClick={() => setArchiving(null)} tone="secondary">
              Keep it
            </Button>
          </Actions>
        }
        onClose={() => setArchiving(null)}
        open={archiving !== null}
        size="sm"
        title={archiving ? `Archive ${archiving.name}?` : 'Archive location'}
      >
        <p>This can be undone by an owner, but the location leaves every active view now.</p>
      </Dialog>

      <Dialog
        description="Your entered details are saved here in the meantime."
        footer={
          <Actions>
            <Button onClick={() => window.location.assign('/billing')}>Upgrade to Pro</Button>
            <Button onClick={() => setCapacityPrompt(false)} tone="secondary">
              Not now
            </Button>
          </Actions>
        }
        onClose={() => setCapacityPrompt(false)}
        open={capacityPrompt}
        size="sm"
        title="You’ve reached your location limit"
      >
        <p>
          The Free plan includes {capacity.capacity} locations. Upgrade to Pro for unlimited
          locations.
        </p>
      </Dialog>
    </div>
  );
}
