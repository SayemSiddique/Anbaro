'use client';

import { fitsStockQuantity } from '@anbaro/contracts';
import type { ItemWithStock, Location, ReorderSuggestion } from '@anbaro/contracts';
import { formatQuantity, unitShortLabel } from '@anbaro/design-tokens';
import { Check, ShoppingCart, X } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  Actions,
  AsyncPanel,
  Button,
  Card,
  CardTitle,
  type Column,
  DataTable,
  Field,
  FormSection,
  InlineError,
  Input,
  Meta,
  QuietButton,
  Select,
  SkeletonTable,
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
  const [listError, setListError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setListError('');
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
      setLoaded(true);
    } catch (caught) {
      setListError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [api, canManage, selectedLocationId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: string, action: 'reviewed_sent' | 'dismissed') {
    setError('');
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
    setError('');
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

  const selectedItem = items.find((item) => item.id === selectedItemId);

  const columns: Column<ReorderSuggestion>[] = [
    {
      id: 'item',
      header: 'Item',
      cell: (row) => <span className="compact-strong">{row.itemName}</span>,
      sortValue: (row) => row.itemName,
    },
    {
      id: 'quantity',
      header: 'Suggested',
      align: 'end',
      numeric: true,
      // The unit rides in a `Meta` so the figures stay in the tabular face and
      // the column of numbers still lines up down the page.
      cell: (row) => (
        <>
          {formatQuantity(row.suggestedQuantity, row.unit)}{' '}
          <Meta inline>{unitShortLabel(row.unit)}</Meta>
        </>
      ),
      sortValue: (row) => Number.parseFloat(row.suggestedQuantity) || 0,
    },
    {
      id: 'location',
      header: 'Location',
      cell: (row) => row.locationName,
      sortValue: (row) => row.locationName,
    },
    {
      id: 'supplier',
      header: 'Primary supplier',
      cell: (row) => row.primarySupplierName ?? <Meta inline>Not set</Meta>,
      sortValue: (row) => row.primarySupplierName,
    },
  ];

  return (
    <div className="stack">
      <Card labelledBy="reorder-title">
        <CardTitle
          id="reorder-title"
          subtitle="Recommendations use target stock levels. Marking one reviewed / sent never creates or dispatches a purchase order."
          title="Reorder recommendations"
        />
        <AsyncPanel
          error={listError || null}
          hasContent={loaded}
          loading={loading}
          loadingLabel="Loading reorder suggestions"
          onRetry={() => void load()}
          skeleton={<SkeletonTable columns={4} rows={5} />}
        >
          <DataTable
            caption="Reorder recommendations"
            columns={columns}
            emptyHint="Add a target stock level to any item and we’ll tell you when it’s time to reorder."
            emptyIcon={<ShoppingCart size={36} strokeWidth={1.5} />}
            emptyTitle="No reorder suggestions yet"
            filters={[
              {
                id: 'no-supplier',
                label: 'No primary supplier',
                predicate: (row) => !row.primarySupplierName,
              },
            ]}
            getRowId={(row) => row.id}
            rowActions={(row) => (
              <Actions>
                <QuietButton
                  icon={<Check size={14} />}
                  onClick={() => void review(row.id, 'reviewed_sent')}
                >
                  Reviewed / sent
                </QuietButton>
                <QuietButton
                  icon={<X size={14} />}
                  onClick={() => void review(row.id, 'dismissed')}
                >
                  Dismiss
                </QuietButton>
              </Actions>
            )}
            rows={suggestions}
            searchPlaceholder="Search items, locations, suppliers"
            searchValue={(row) =>
              `${row.itemName} ${row.locationName} ${row.primarySupplierName ?? ''}`
            }
          />
        </AsyncPanel>
      </Card>

      {canManage ? (
        /* No skeleton here on purpose: every control exists before the data
           does, so the card's geometry never changes and there is nothing for
           a loading state to hold in place. Only the option lists fill in. */
        <Card labelledBy="levels-title">
          <CardTitle
            id="levels-title"
            subtitle="Saved through the server-owned stock-level path; quantities remain ledger projections."
            title="Location target stock levels"
          />
          <FormSection onSubmit={saveLevels} standalone>
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
          </FormSection>
        </Card>
      ) : null}

      {error ? (
        <div className="inline-error-stacked">
          <InlineError detail={error} title="Couldn’t update this workflow" />
        </div>
      ) : null}
    </div>
  );
}
