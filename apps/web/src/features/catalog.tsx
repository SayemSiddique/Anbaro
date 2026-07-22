'use client';

import {
  type Category,
  fitsStockQuantity,
  type ItemWithStock,
  type Location,
  SessionApiClient,
} from '@anbaro/contracts';
import { Archive, History, Package, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { formatQuantity, packDescription, unitShortLabel } from '@anbaro/design-tokens';

import {
  Button,
  Card,
  CardTitle,
  CategoryAvatar,
  EmptyState,
  Field,
  Input,
  Select,
  StatePanel,
  StockBadge,
  UnitSelect,
} from '../components/ui';
import { apiErrorMessage, useSession } from '../lib/session';

type CategoryGroup = {
  categoryId: string;
  categoryName: string;
  categoryIcon: string | null;
  items: ItemWithStock[];
  attentionCount: number;
};

function groupByCategory(items: ItemWithStock[]): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup>();
  for (const item of items) {
    let group = groups.get(item.categoryId);
    if (!group) {
      group = {
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        categoryIcon: item.categoryIcon,
        items: [],
        attentionCount: 0,
      };
      groups.set(item.categoryId, group);
    }
    group.items.push(item);
    if (item.stockCondition === 'low_stock' || item.stockCondition === 'out_of_stock') {
      group.attentionCount += 1;
    }
  }
  return [...groups.values()].sort((a, b) => a.categoryName.localeCompare(b.categoryName));
}

export function CatalogFeature() {
  const { api, permissions } = useSession();
  const canWrite = permissions.has('item:write');
  const canArchive = permissions.has('item:archive');
  const canAdjust = permissions.has('stock:write');
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<ItemWithStock[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ItemWithStock | null>(null);
  const [history, setHistory] = useState<
    Awaited<ReturnType<SessionApiClient['getStockEvents']>>['data']
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [categoryResponse, locationResponse] = await Promise.all([
        api.getCategories(),
        api.getLocations(),
      ]);
      setCategories(categoryResponse.data);
      setLocations(locationResponse.data);
      const nextLocation = locationId || locationResponse.data[0]?.id || '';
      setLocationId(nextLocation);
      const itemResponse = await api.getItems({
        ...(categoryId ? { categoryId } : {}),
        ...(nextLocation ? { locationId: nextLocation } : {}),
        ...(search ? { search } : {}),
      });
      setItems(itemResponse.data);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [api, categoryId, locationId, search]);
  useEffect(() => {
    void load();
  }, [load]);

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api.createCategory({
        name: String(form.get('categoryName')),
        icon: String(form.get('categoryIcon')) || null,
        broadTypeFallback: String(form.get('broadTypeFallback')) as Category['broadTypeFallback'],
      });
      formElement.reset();
      await load();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }
  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const unit = String(form.get('customUnit') || '').trim() || String(form.get('unit'));
    const packSize = Number(form.get('packSize'));
    const packUnit = String(form.get('packUnit') || '').trim();
    try {
      await api.createItem({
        categoryId: String(form.get('itemCategoryId')),
        name: String(form.get('itemName')),
        unit,
        ...(packSize > 0 && packUnit ? { packSize, packUnit } : {}),
        barcodeIdentifier: String(form.get('barcodeIdentifier')) || null,
      });
      formElement.reset();
      await load();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }
  async function openItem(item: ItemWithStock) {
    setSelected(item);
    if (!locationId) return;
    try {
      setHistory((await api.getStockEvents(item.id, { locationId })).data);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }
  async function addMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !locationId) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const eventType = String(form.get('eventType')) as 'adjustment' | 'loss';
    const enteredQuantity = Number(form.get('quantity'));
    if (!enteredQuantity || !fitsStockQuantity(enteredQuantity)) {
      setError('Enter a non-zero quantity with at most 3 decimal places.');
      return;
    }
    try {
      await api.createStockEvent({
        itemId: selected.id,
        locationId,
        eventType,
        quantityDelta: eventType === 'loss' ? -Math.abs(enteredQuantity) : enteredQuantity,
        idempotencyKey: crypto.randomUUID(),
        ...(eventType === 'loss' ? { reasonCode: String(form.get('reasonCode')) } : {}),
      });
      formElement.reset();
      await openItem(selected);
      await load();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }
  async function archiveItem(item: ItemWithStock) {
    if (!window.confirm(`Archive ${item.name}? Its stock history will remain available.`)) return;
    try {
      await api.archiveItem(item.id);
      setSelected(null);
      await load();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }

  return (
    <div className="stack">
      <Card labelledBy="items-title">
        <CardTitle
          id="items-title"
          subtitle="Quantities change only through attributed movements — never direct edits."
          title="Item stock"
        />
        <div className="form-row" style={{ marginBottom: 16 }}>
          <Field label="Location">
            <Select
              onChange={(event) => setLocationId(event.target.value)}
              style={{ minWidth: 180 }}
              value={locationId}
            >
              <option value="">All locations</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category">
            <Select
              onChange={(event) => setCategoryId(event.target.value)}
              style={{ minWidth: 160 }}
              value={categoryId}
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Search">
            <Input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Item name or barcode"
              value={search}
            />
          </Field>
          <Button icon={<Search size={15} />} onClick={() => void load()} tone="secondary">
            Search
          </Button>
        </div>
        {loading ? (
          <p>Loading items…</p>
        ) : items.length === 0 ? (
          <EmptyState
            hint="Add a category and your first item to start tracking stock."
            icon={<Package size={36} strokeWidth={1.5} />}
            title="No items yet"
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Unit</th>
                  {locationId ? <th>On hand</th> : null}
                  {locationId ? <th>Status</th> : null}
                  <th />
                </tr>
              </thead>
              {groupByCategory(items).map((group) => (
                <tbody key={group.categoryId}>
                  <tr>
                    <td
                      colSpan={locationId ? 5 : 3}
                      style={{ background: 'var(--surface-subtle)', padding: '8px 12px' }}
                    >
                      <span
                        style={{
                          alignItems: 'center',
                          display: 'flex',
                          fontWeight: 600,
                          gap: 10,
                        }}
                      >
                        <CategoryAvatar icon={group.categoryIcon} name={group.categoryName} />
                        {group.categoryName}
                        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                          {group.items.length} item{group.items.length === 1 ? '' : 's'}
                          {locationId && group.attentionCount > 0
                            ? ` · ${group.attentionCount} need${group.attentionCount === 1 ? 's' : ''} attention`
                            : ''}
                        </span>
                      </span>
                    </td>
                  </tr>
                  {group.items.map((item) => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 600, paddingLeft: 24 }}>{item.name}</td>
                      <td>
                        {unitShortLabel(item.unit)}
                        {packDescription(item.unit, item.packSize, item.packUnit) ? (
                          <span
                            style={{ color: 'var(--text-muted)', display: 'block', fontSize: 12 }}
                          >
                            {packDescription(item.unit, item.packSize, item.packUnit)}
                          </span>
                        ) : null}
                      </td>
                      {locationId ? <td>{formatQuantity(item.quantity, item.unit)}</td> : null}
                      {locationId ? (
                        <td>
                          <StockBadge condition={item.stockCondition} />
                        </td>
                      ) : null}
                      <td style={{ textAlign: 'right' }}>
                        <Button
                          icon={<History size={14} />}
                          onClick={() => void openItem(item)}
                          size="sm"
                          tone="secondary"
                        >
                          Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </Card>

      {selected ? (
        <Card labelledBy="item-detail-title">
          <CardTitle
            action={
              canArchive ? (
                <Button
                  icon={<Archive size={14} />}
                  onClick={() => void archiveItem(selected)}
                  size="sm"
                  tone="danger"
                >
                  Archive item
                </Button>
              ) : undefined
            }
            id="item-detail-title"
            subtitle={`${selected.categoryName} · ${unitShortLabel(selected.unit)}${packDescription(selected.unit, selected.packSize, selected.packUnit) ? ` · ${packDescription(selected.unit, selected.packSize, selected.packUnit)}` : ''} · on hand at selected location: ${selected.quantity ?? 'choose a location'}`}
            title={selected.name}
          />
          {canAdjust && locationId ? (
            <form className="form-grid" onSubmit={addMovement}>
              <h3>Record a stock movement</h3>
              <Field label="Movement type">
                <Select defaultValue="adjustment" name="eventType">
                  <option value="adjustment">Manual adjustment</option>
                  <option value="loss">Mark lost</option>
                </Select>
              </Field>
              <Field label="Quantity">
                <Input name="quantity" required step="0.001" type="number" />
              </Field>
              <Field hint="Required when marking a loss." label="Loss reason">
                <Input name="reasonCode" />
              </Field>
              <div>
                <Button type="submit">Record movement</Button>
              </div>
            </form>
          ) : null}
          <h3 style={{ margin: '18px 0 10px' }}>Movement history</h3>
          {history.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Type</th>
                    <th>Change</th>
                    <th>Resulting</th>
                    <th>Reason</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((event) => (
                    <tr key={event.id}>
                      <td>{new Date(event.createdAt).toLocaleString()}</td>
                      <td>{event.eventType}</td>
                      <td>{event.quantityDelta}</td>
                      <td>{event.resultingQuantity}</td>
                      <td>{event.reasonCode ?? '—'}</td>
                      <td>{event.actorName ?? event.actorUserId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>No movements recorded at this location.</p>
          )}
        </Card>
      ) : null}

      {canWrite ? (
        <Card labelledBy="catalog-setup-title">
          <CardTitle
            id="catalog-setup-title"
            subtitle="Categories organize the catalog; items carry a unit and optional barcode."
            title="Catalog setup"
          />
          <div
            style={{
              display: 'grid',
              gap: 24,
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            }}
          >
            <form className="form-grid" onSubmit={addCategory} style={{ alignContent: 'start' }}>
              <h3>Add category</h3>
              <Field label="Category name">
                <Input name="categoryName" required />
              </Field>
              <Field
                hint="Leave empty to auto-generate an icon from the category name."
                label="Icon (optional)"
              >
                <Input maxLength={64} name="categoryIcon" placeholder="e.g. salad or spray-can" />
              </Field>
              <Field label="Category type">
                <Select defaultValue="other" name="broadTypeFallback">
                  <option value="food">Food &amp; beverage</option>
                  <option value="cleaning">Cleaning &amp; chemicals</option>
                  <option value="equipment">Equipment &amp; tools</option>
                  <option value="other">General merchandise</option>
                </Select>
              </Field>
              <div>
                <Button icon={<Plus size={15} />} type="submit">
                  Add category
                </Button>
              </div>
            </form>
            <form className="form-grid" onSubmit={addItem} style={{ alignContent: 'start' }}>
              <h3>Add item</h3>
              <Field label="Category">
                <Select name="itemCategoryId" required>
                  <option value="">Choose a category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Item name">
                <Input name="itemName" required />
              </Field>
              <Field hint="How this item is counted and stocked." label="Unit">
                <UnitSelect name="unit" required />
              </Field>
              <Field hint="Only if the unit you need isn't listed." label="Custom unit (optional)">
                <Input maxLength={32} name="customUnit" placeholder="e.g. sack" />
              </Field>
              <div className="form-row">
                <Field hint="Optional purchasing pack, e.g. 24." label="Units per pack">
                  <Input min="0.001" name="packSize" step="0.001" type="number" />
                </Field>
                <Field hint="e.g. case, box." label="Pack unit">
                  <Input maxLength={32} name="packUnit" placeholder="case" />
                </Field>
              </div>
              <Field hint="Optional — scan or type. Used for instant lookup." label="Barcode">
                <Input name="barcodeIdentifier" />
              </Field>
              <div>
                <Button disabled={categories.length === 0} icon={<Plus size={15} />} type="submit">
                  Add item
                </Button>
              </div>
            </form>
          </div>
        </Card>
      ) : null}

      {error ? (
        <StatePanel title="Couldn’t update catalog or stock" tone="error">
          {error}
        </StatePanel>
      ) : null}
    </div>
  );
}
