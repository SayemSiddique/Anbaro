'use client';

import type { ItemWithStock, Supplier, SupplierMapping } from '@anbaro/contracts';
import { Plus, Trash2, Truck } from 'lucide-react';
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
  EmptyState,
  Field,
  FormSection,
  Input,
  Meta,
  PageSkeleton,
  Select,
} from '../components/ui';
import { apiErrorMessage, useSession } from '../lib/session';

const supplierColumns: Column<Supplier>[] = [
  {
    id: 'name',
    header: 'Supplier',
    cell: (row) => <span className="compact-strong">{row.name}</span>,
    sortValue: (row) => row.name,
  },
  {
    id: 'contact',
    header: 'Contact',
    cell: (row) =>
      [row.contactEmail, row.contactPhone].filter(Boolean).join(' · ') || (
        <Meta inline>No contact on file</Meta>
      ),
    sortValue: (row) => row.contactEmail ?? row.contactPhone ?? null,
  },
  {
    id: 'itemCount',
    header: 'Mapped items',
    align: 'end',
    numeric: true,
    cell: (row) => row.itemCount ?? 0,
    sortValue: (row) => row.itemCount ?? 0,
  },
];

export function SuppliersFeature() {
  const { api } = useSession();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<ItemWithStock[]>([]);
  const [mappings, setMappings] = useState<SupplierMapping[]>([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  // The Checkbox primitive is controlled and carries no `name`, so this one
  // field sits in state while the rest of the form stays uncontrolled.
  const [mappingIsPrimary, setMappingIsPrimary] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [supplierResponse, itemResponse] = await Promise.all([
        api.getSuppliers(),
        api.getItems({}),
      ]);
      const itemId = selectedItemId || itemResponse.data[0]?.id || '';
      const mappingResponse = itemId
        ? await api.getItemSuppliers(itemId)
        : { data: [] as SupplierMapping[] };
      setSuppliers(supplierResponse.data);
      setItems(itemResponse.data);
      setMappings(mappingResponse.data);
      setSelectedItemId(itemId);
      setLoaded(true);
      setError('');
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [api, selectedItemId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function createSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api.createSupplier({
        name: String(form.get('name')),
        contactEmail: String(form.get('email')) || null,
        contactPhone: String(form.get('phone')) || null,
      });
      formElement.reset();
      await load();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }
  async function addMapping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (!selectedItemId) return;
    try {
      await api.createItemSupplier(selectedItemId, {
        supplierId: String(form.get('supplierId')),
        supplierSku: String(form.get('supplierSku')) || null,
        isPrimary: mappingIsPrimary,
      });
      formElement.reset();
      setMappingIsPrimary(false);
      await load();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }
  async function removeMapping(mappingId: string) {
    if (!selectedItemId) return;
    try {
      await api.deleteItemSupplier(selectedItemId, mappingId);
      await load();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }

  return (
    <AsyncPanel
      error={error || null}
      hasContent={loaded}
      loading={loading}
      loadingLabel="Loading suppliers and mappings"
      onRetry={() => void load()}
      skeleton={<PageSkeleton body="table" />}
    >
      <div className="stack">
        <Card labelledBy="suppliers-title">
          <CardTitle
            id="suppliers-title"
            subtitle="Reference data for reorder recommendations. Anbaro never places orders for you."
            title="Suppliers"
          />
          <DataTable
            caption="Suppliers"
            columns={supplierColumns}
            emptyHint="Add the vendors you order from, then map them to items below."
            emptyIcon={<Truck size={36} strokeWidth={1.5} />}
            emptyTitle="No suppliers yet"
            getRowId={(row) => row.id}
            rows={suppliers}
            searchPlaceholder="Search suppliers"
            searchValue={(row) => `${row.name} ${row.contactEmail ?? ''} ${row.contactPhone ?? ''}`}
          />
          <FormSection onSubmit={createSupplier} title="Add supplier">
            <Field label="Name">
              <Input name="name" required />
            </Field>
            <Field hint="Optional" label="Email">
              <Input name="email" type="email" />
            </Field>
            <Field hint="Optional" label="Phone">
              <Input name="phone" />
            </Field>
            <div>
              <Button icon={<Plus size={15} />} type="submit">
                Add supplier
              </Button>
            </div>
          </FormSection>
        </Card>

        <Card labelledBy="mappings-title">
          <CardTitle
            id="mappings-title"
            subtitle="Mappings are reference data only; they do not place orders."
            title="Item supplier mappings"
          />
          {/* form-grid, not a bare Field: it carries the same readable measure
              every other field on the page sits at. */}
          <div className="form-grid">
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
          </div>
          {mappings.length === 0 ? (
            <EmptyState
              hint="Map a supplier to this item so reorder suggestions know who to point at."
              icon={<Truck size={36} strokeWidth={1.5} />}
              title="No suppliers mapped to this item"
            />
          ) : (
            <ul className="list-plain">
              {mappings.map((mapping) => (
                <li className="list-row" key={mapping.id}>
                  <div>
                    <Actions>
                      <strong>{mapping.supplierName ?? mapping.supplierId}</strong>
                      {mapping.isPrimary ? <Badge tone="info">Primary</Badge> : null}
                    </Actions>
                    {mapping.supplierSku ? <Meta>SKU {mapping.supplierSku}</Meta> : null}
                  </div>
                  <Button
                    icon={<Trash2 size={14} />}
                    onClick={() => void removeMapping(mapping.id)}
                    size="sm"
                    tone="secondary"
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <FormSection onSubmit={addMapping} title="Map a supplier">
            <Field label="Supplier">
              <Select name="supplierId" required>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field hint="Optional" label="Supplier SKU">
              <Input name="supplierSku" />
            </Field>
            <Checkbox
              checked={mappingIsPrimary}
              label="Primary supplier"
              onChange={setMappingIsPrimary}
            />
            <div>
              <Button type="submit">Save mapping</Button>
            </div>
          </FormSection>
        </Card>
      </div>
    </AsyncPanel>
  );
}
