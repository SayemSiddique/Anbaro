'use client';

import { ApiClientError, type Location } from '@anbaro/contracts';
import { MapPin, Pencil, Plus } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  Field,
  Input,
  StatePanel,
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
  const [error, setError] = useState('');
  const [capacityPrompt, setCapacityPrompt] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadLocations = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.getLocations();
      setLocations(response.data);
      setCapacity({ used: response.meta.used, capacity: response.meta.capacity });
    } catch (caught) {
      setError(apiErrorMessage(caught));
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
  async function archive(id: string) {
    if (!window.confirm('Archive this location? History will remain available.')) return;
    try {
      await api.archiveLocation(id);
      await loadLocations();
    } catch (caught) {
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
        {loading ? (
          <p>Loading locations…</p>
        ) : locations.length === 0 ? (
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
                  {location.address ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{location.address}</p>
                  ) : null}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    icon={<Pencil size={14} />}
                    onClick={() => setEditing(location)}
                    size="sm"
                    tone="secondary"
                  >
                    Edit
                  </Button>
                  <Button onClick={() => void archive(location.id)} size="sm" tone="danger">
                    Archive
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <form
          className="form-grid"
          onSubmit={create}
          style={{ borderTop: '1px solid var(--border)', marginTop: 20, paddingTop: 20 }}
        >
          <h3>{locations.length ? 'Add another location' : 'Add your first location'}</h3>
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
        </form>
        {error ? (
          <p role="alert" style={{ color: 'var(--danger)', marginTop: 10 }}>
            {error}
          </p>
        ) : null}
      </Card>
      {editing ? (
        <Card labelledBy="edit-location-title">
          <CardTitle id="edit-location-title" title={`Edit ${editing.name}`} />
          <form className="form-grid" onSubmit={saveEdit}>
            <Field label="Name">
              <Input defaultValue={editing.name} name="name" required />
            </Field>
            <Field label="Address">
              <Input defaultValue={editing.address ?? ''} name="address" />
            </Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button type="submit">Save changes</Button>
              <Button onClick={() => setEditing(null)} tone="secondary" type="button">
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
      {capacityPrompt ? (
        <StatePanel
          action={
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={() => window.location.assign('/billing')}>Upgrade to Pro</Button>
              <Button onClick={() => setCapacityPrompt(false)} tone="secondary">
                Not now
              </Button>
            </div>
          }
          title="You’ve reached your location limit"
          tone="info"
        >
          The Free plan includes {capacity.capacity} locations. Upgrade to Pro for unlimited
          locations — your entered details are saved here in the meantime.
        </StatePanel>
      ) : null}
    </div>
  );
}
