'use client';

import type { ItemWithStock, Supplier, SupplierMapping } from '@stock/contracts';
import { Plus, Trash2, Truck } from 'lucide-react';
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

export function SuppliersFeature() {
  const { api } = useSession();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<ItemWithStock[]>([]);
  const [mappings, setMappings] = useState<SupplierMapping[]>([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
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
        isPrimary: form.get('isPrimary') === 'on',
      });
      formElement.reset();
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

  if (loading)
    return <StatePanel title="Loading suppliers">Loading suppliers and mappings…</StatePanel>;

  return (
    <div className="stack">
      {error ? (
        <StatePanel title="Couldn’t update suppliers" tone="error">
          {error}
        </StatePanel>
      ) : null}
      <Card labelledBy="suppliers-title">
        <CardTitle
          id="suppliers-title"
          subtitle="Reference data for reorder recommendations. Counted never places orders for you."
          title="Suppliers"
        />
        {!suppliers.length ? (
          <EmptyState
            hint="Add the vendors you order from, then map them to items below."
            icon={<Truck size={36} strokeWidth={1.5} />}
            title="No suppliers yet"
          />
        ) : (
          <ul className="list-plain" style={{ marginBottom: 18 }}>
            {suppliers.map((supplier) => (
              <li className="list-row" key={supplier.id}>
                <div>
                  <strong>{supplier.name}</strong>
                  {supplier.contactEmail || supplier.contactPhone ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                      {[supplier.contactEmail, supplier.contactPhone].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                </div>
                <Badge tone="neutral">{supplier.itemCount ?? 0} mapped items</Badge>
              </li>
            ))}
          </ul>
        )}
        <form className="form-grid" onSubmit={createSupplier}>
          <h3>Add supplier</h3>
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
        </form>
      </Card>
      <Card labelledBy="mappings-title">
        <CardTitle
          id="mappings-title"
          subtitle="Mappings are reference data only; they do not place orders."
          title="Item supplier mappings"
        />
        <Field label="Item">
          <Select
            onChange={(event) => setSelectedItemId(event.target.value)}
            style={{ maxWidth: 320 }}
            value={selectedItemId}
          >
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
        <ul className="list-plain" style={{ margin: '14px 0' }}>
          {mappings.map((mapping) => (
            <li className="list-row" key={mapping.id}>
              <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
                <strong>{mapping.supplierName ?? mapping.supplierId}</strong>
                {mapping.supplierSku ? <small>SKU {mapping.supplierSku}</small> : null}
                {mapping.isPrimary ? <Badge tone="info">Primary</Badge> : null}
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
        <form className="form-grid" onSubmit={addMapping}>
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
          <label className="checkbox-row">
            <input name="isPrimary" type="checkbox" /> Primary supplier
          </label>
          <div>
            <Button type="submit">Save mapping</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
