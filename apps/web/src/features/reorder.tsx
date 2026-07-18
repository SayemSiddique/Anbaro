'use client';

import { fitsStockQuantity } from '@stock/contracts';
import type { ItemWithStock, Location, ReorderSuggestion } from '@stock/contracts';
import { Check, ShoppingCart, X } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
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

export function ReorderFeature() {
  const { api, permissions } = useSession();
  const canManage = permissions.has('supplier:manage');
  const [suggestions, setSuggestions] = useState<ReorderSuggestion[]>([]);
  const [items, setItems] = useState<ItemWithStock[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const locationResponse = await api.getLocations();
      const locationId = selectedLocationId || locationResponse.data[0]?.id || '';
      const [itemResponse, suggestionResponse] = await Promise.all([
        api.getItems(locationId ? { locationId } : {}),
        canManage
          ? api.getReorderSuggestions()
          : Promise.resolve({ data: [] as ReorderSuggestion[] }),
      ]);
      setLocations(locationResponse.data);
      setItems(itemResponse.data);
      setSuggestions(suggestionResponse.data);
      setSelectedLocationId(locationId);
      setSelectedItemId((current) => current || itemResponse.data[0]?.id || '');
      setError('');
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [api, canManage, selectedLocationId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: string, action: 'reviewed_sent' | 'dismissed') {
    try {
      await api.reviewReorderSuggestion(id, action);
      await load();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }
  async function saveLevels(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!selectedItemId || !selectedLocationId) return;
    const threshold = Number(form.get('threshold'));
    const parLevel = String(form.get('parLevel')).trim() ? Number(form.get('parLevel')) : null;
    if (!fitsStockQuantity(threshold) || (parLevel !== null && !fitsStockQuantity(parLevel))) {
      setError('Enter levels with at most 3 decimal places.');
      return;
    }
    try {
      await api.updateLocationStockLevels(selectedItemId, {
        locationId: selectedLocationId,
        threshold,
        parLevel,
      });
      await load();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }

  if (loading)
    return <StatePanel title="Loading recommendations">Preparing reorder suggestions…</StatePanel>;

  const selectedItem = items.find((item) => item.id === selectedItemId);

  return (
    <div className="stack">
      {error ? (
        <StatePanel title="Couldn’t update this workflow" tone="error">
          {error}
        </StatePanel>
      ) : null}
      <Card labelledBy="reorder-title">
        <CardTitle
          id="reorder-title"
          subtitle="Recommendations use target stock levels. Marking one reviewed / sent never creates or dispatches a purchase order."
          title="Reorder recommendations"
        />
        {!suggestions.length ? (
          <EmptyState
            hint="Add a target stock level to any item and we’ll tell you when it’s time to reorder."
            icon={<ShoppingCart size={36} strokeWidth={1.5} />}
            title="No reorder suggestions yet"
          />
        ) : (
          <ul className="list-plain">
            {suggestions.map((suggestion) => (
              <li className="list-row" key={suggestion.id}>
                <div style={{ display: 'grid', gap: 2 }}>
                  <strong>
                    {suggestion.itemName}: {suggestion.suggestedQuantity} {suggestion.unit}
                  </strong>
                  <small>
                    {suggestion.locationName}
                    {suggestion.primarySupplierName
                      ? ` · Primary supplier: ${suggestion.primarySupplierName}`
                      : ''}
                  </small>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    icon={<Check size={14} />}
                    onClick={() => void review(suggestion.id, 'reviewed_sent')}
                    size="sm"
                  >
                    Reviewed / sent
                  </Button>
                  <Button
                    icon={<X size={14} />}
                    onClick={() => void review(suggestion.id, 'dismissed')}
                    size="sm"
                    tone="secondary"
                  >
                    Dismiss
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {canManage ? (
        <Card labelledBy="levels-title">
          <CardTitle
            id="levels-title"
            subtitle="Saved through the server-owned stock-level path; quantities remain ledger projections."
            title="Location target stock levels"
          />
          <form className="form-grid" onSubmit={saveLevels}>
            <Field label="Location">
              <Select
                onChange={(event) => setSelectedLocationId(event.target.value)}
                value={selectedLocationId}
              >
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Item">
              <Select
                onChange={(event) => setSelectedItemId(event.target.value)}
                value={selectedItemId}
              >
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Low-stock threshold">
              <Input
                defaultValue={selectedItem?.threshold ?? '0'}
                key={`threshold-${selectedItemId}`}
                min="0"
                name="threshold"
                required
                step="0.001"
                type="number"
              />
            </Field>
            <Field hint="Optional" label="Target stock level">
              <Input
                defaultValue={selectedItem?.parLevel ?? ''}
                key={`par-${selectedItemId}`}
                min="0"
                name="parLevel"
                step="0.001"
                type="number"
              />
            </Field>
            <div>
              <Button type="submit">Save stock levels</Button>
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
