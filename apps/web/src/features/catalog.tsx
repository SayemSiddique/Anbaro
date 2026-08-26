'use client';

import {
  type Category,
  fitsStockQuantity,
  type ItemWithStock,
  type Location,
  SessionApiClient,
} from '@anbaro/contracts';
import { Archive, History, Package, Plus } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { formatQuantity, packDescription, unitShortLabel } from '@anbaro/design-tokens';

import {
  Actions,
  AsyncPanel,
  Button,
  Card,
  CardTitle,
  CategoryAvatar,
  type Column,
  DataTable,
  Dialog,
  Field,
  type FilterChip,
  FormSection,
  InlineError,
  Input,
  Meta,
  Select,
  type SavedView,
  SkeletonTable,
  StockBadge,
  UnitSelect,
} from '../components/ui';
import { apiErrorMessage, useSession } from '../lib/session';

type MovementEvent = Awaited<ReturnType<SessionApiClient['getStockEvents']>>['data'][number];

/* The unit comes from the item whose history this is, which is why these are
   built per item rather than declared once: a stored "−4.000" reads as "−4" for
   a box and "−4" for a kilo, and neither should reach the screen untrimmed. */
function movementColumnsFor(unit: string): Column<MovementEvent>[] {
  return [
    {
      id: 'when',
      header: 'When',
      cell: (event) => new Date(event.createdAt).toLocaleString(),
      sortValue: (event) => event.createdAt,
    },
    {
      id: 'type',
      header: 'Type',
      cell: (event) => event.eventType,
      sortValue: (event) => event.eventType,
    },
    {
      id: 'change',
      header: 'Change',
      align: 'end',
      numeric: true,
      cell: (event) => formatQuantity(event.quantityDelta, unit),
      sortValue: (event) => Number.parseFloat(event.quantityDelta) || 0,
    },
    {
      id: 'resulting',
      header: 'Resulting',
      align: 'end',
      numeric: true,
      cell: (event) => formatQuantity(event.resultingQuantity, unit),
      sortValue: (event) => Number.parseFloat(event.resultingQuantity) || 0,
    },
    {
      id: 'reason',
      header: 'Reason',
      cell: (event) => event.reasonCode ?? <Meta inline>None</Meta>,
    },
    { id: 'by', header: 'By', cell: (event) => event.actorName ?? event.actorUserId },
  ];
}

const movementViews: SavedView<MovementEvent>[] = [
  { id: 'all', label: 'All', sort: { columnId: 'when', direction: 'descending' } },
  {
    id: 'losses',
    label: 'Losses',
    predicate: (event) => event.eventType === 'loss',
    sort: { columnId: 'when', direction: 'descending' },
  },
];

const needsAttention = (item: ItemWithStock) =>
  item.stockCondition === 'low_stock' || item.stockCondition === 'out_of_stock';

export function CatalogFeature() {
  const { api, permissions } = useSession();
  const canWrite = permissions.has('item:write');
  const canArchive = permissions.has('item:archive');
  const canAdjust = permissions.has('stock:write');
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<ItemWithStock[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState('');
  // Three failures, three states. A catalog form that will not save says
  // nothing about the item list, and neither one belongs to the detail card.
  const [error, setError] = useState('');
  const [setupError, setSetupError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ItemWithStock | null>(null);
  const [archiving, setArchiving] = useState<ItemWithStock | null>(null);
  const [history, setHistory] = useState<MovementEvent[]>([]);

  // The location is the only server-side narrowing left: it decides what "on
  // hand" means. Category and search are the table's own, so their chips can
  // count what is actually in front of you.
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
      const itemResponse = await api.getItems(nextLocation ? { locationId: nextLocation } : {});
      setItems(itemResponse.data);
      setLoaded(true);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [api, locationId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSetupError('');
    try {
      await api.createCategory({
        name: String(form.get('categoryName')),
        icon: String(form.get('categoryIcon')) || null,
        broadTypeFallback: String(form.get('broadTypeFallback')) as Category['broadTypeFallback'],
      });
      formElement.reset();
      await load();
    } catch (caught) {
      setSetupError(apiErrorMessage(caught));
    }
  }
  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const unit = String(form.get('customUnit') || '').trim() || String(form.get('unit'));
    const packSize = Number(form.get('packSize'));
    const packUnit = String(form.get('packUnit') || '').trim();
    setSetupError('');
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
      setSetupError(apiErrorMessage(caught));
    }
  }
  async function openItem(item: ItemWithStock) {
    setSelected(item);
    setDetailError('');
    if (!locationId) return;
    try {
      setHistory((await api.getStockEvents(item.id, { locationId })).data);
    } catch (caught) {
      setDetailError(apiErrorMessage(caught));
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
      setDetailError('Enter a non-zero quantity with at most 3 decimal places.');
      return;
    }
    setDetailError('');
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
      setDetailError(apiErrorMessage(caught));
    }
  }
  async function archiveItem() {
    if (!archiving) return;
    setDetailError('');
    try {
      await api.archiveItem(archiving.id);
      setArchiving(null);
      setSelected(null);
      await load();
    } catch (caught) {
      setDetailError(apiErrorMessage(caught));
    }
  }

  const columns: Column<ItemWithStock>[] = [
    {
      id: 'item',
      header: 'Item',
      cell: (item) => (
        <Actions>
          <CategoryAvatar icon={item.categoryIcon} name={item.categoryName} />
          <div>
            <span className="compact-strong">{item.name}</span>
            <Meta>{item.categoryName}</Meta>
          </div>
        </Actions>
      ),
      sortValue: (item) => item.name,
    },
    {
      id: 'unit',
      header: 'Unit',
      cell: (item) => {
        const pack = packDescription(item.unit, item.packSize, item.packUnit);
        return (
          <div>
            {unitShortLabel(item.unit)}
            {pack ? <Meta>{pack}</Meta> : null}
          </div>
        );
      },
      sortValue: (item) => item.unit,
    },
    ...(locationId
      ? ([
          {
            id: 'quantity',
            header: 'On hand',
            align: 'end',
            numeric: true,
            cell: (item) =>
              item.quantity === null ? (
                <Meta inline>Not stocked</Meta>
              ) : (
                formatQuantity(item.quantity, item.unit)
              ),
            sortValue: (item) => (item.quantity === null ? null : Number.parseFloat(item.quantity)),
          },
          {
            id: 'condition',
            header: 'Status',
            cell: (item) => <StockBadge condition={item.stockCondition} />,
            sortValue: (item) => item.stockCondition,
          },
        ] satisfies Column<ItemWithStock>[])
      : []),
  ];

  // The category grouping this table used to render, as chips that filter it:
  // same information, one table, and the counts now follow the search.
  const categoryFilters: FilterChip<ItemWithStock>[] = [
    ...new Map(items.map((item) => [item.categoryId, item.categoryName])).entries(),
  ]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([id, name]) => ({
      id: `category-${id}`,
      label: name,
      predicate: (item: ItemWithStock) => item.categoryId === id,
    }));

  const itemViews: SavedView<ItemWithStock>[] = locationId
    ? [
        { id: 'all', label: 'All items' },
        { id: 'attention', label: 'Needs attention', predicate: needsAttention },
      ]
    : [];

  return (
    <div className="stack">
      <Card labelledBy="items-title">
        <CardTitle
          id="items-title"
          subtitle="Quantities change only through attributed movements — never direct edits."
          title="Item stock"
        />
        <div className="stack">
          <div className="form-row">
            <Field grow label="Location">
              <Select onChange={(event) => setLocationId(event.target.value)} value={locationId}>
                <option value="">All locations</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <AsyncPanel
            error={error || null}
            hasContent={loaded}
            loading={loading}
            loadingLabel="Loading items"
            onRetry={() => void load()}
            skeleton={<SkeletonTable columns={locationId ? 5 : 3} rows={6} />}
          >
            <DataTable
              caption="Item stock"
              columns={columns}
              emptyHint="Add a category and your first item to start tracking stock."
              emptyIcon={<Package size={36} strokeWidth={1.5} />}
              emptyTitle="No items yet"
              filters={categoryFilters}
              getRowId={(item) => item.id}
              rowActions={(item) => (
                <Button
                  icon={<History size={14} />}
                  onClick={() => void openItem(item)}
                  size="sm"
                  tone="secondary"
                >
                  Details
                </Button>
              )}
              rows={items}
              searchPlaceholder="Item name or barcode"
              searchValue={(item) => `${item.name} ${item.barcodeIdentifier ?? ''}`}
              views={itemViews}
            />
          </AsyncPanel>
        </div>
      </Card>

      {selected ? (
        <Card labelledBy="item-detail-title">
          <CardTitle
            action={
              canArchive ? (
                <Button
                  icon={<Archive size={14} />}
                  onClick={() => setArchiving(selected)}
                  size="sm"
                  tone="danger"
                >
                  Archive item
                </Button>
              ) : undefined
            }
            id="item-detail-title"
            subtitle={`${selected.categoryName} · ${unitShortLabel(selected.unit)}${packDescription(selected.unit, selected.packSize, selected.packUnit) ? ` · ${packDescription(selected.unit, selected.packSize, selected.packUnit)}` : ''} · on hand at selected location: ${selected.quantity === null ? 'choose a location' : formatQuantity(selected.quantity, selected.unit)}`}
            title={selected.name}
          />
          {detailError ? (
            <div className="inline-error-stacked">
              <InlineError detail={detailError} title="Couldn’t update this item" />
            </div>
          ) : null}
          {canAdjust && locationId ? (
            <FormSection onSubmit={addMovement} standalone title="Record a stock movement">
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
              <Actions>
                <Button type="submit">Record movement</Button>
              </Actions>
            </FormSection>
          ) : null}
          <h3 className="section-heading">Movement history</h3>
          <DataTable
            caption={`Movement history for ${selected.name}`}
            columns={movementColumnsFor(selected.unit)}
            emptyHint="No movements recorded at this location."
            emptyTitle="No movements yet"
            getRowId={(event) => event.id}
            rows={history}
            searchPlaceholder="Reason, type, or person"
            searchValue={(event) =>
              `${event.eventType} ${event.reasonCode ?? ''} ${event.actorName ?? event.actorUserId}`
            }
            views={movementViews}
          />
        </Card>
      ) : null}

      {canWrite ? (
        <Card labelledBy="catalog-setup-title">
          <CardTitle
            id="catalog-setup-title"
            subtitle="Categories organize the catalog; items carry a unit and optional barcode."
            title="Catalog setup"
          />
          {setupError ? (
            <div className="inline-error-stacked">
              <InlineError detail={setupError} title="Couldn’t save that" />
            </div>
          ) : null}
          <div className="form-columns">
            <FormSection onSubmit={addCategory} standalone title="Add category">
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
              <Actions>
                <Button icon={<Plus size={15} />} tone="secondary" type="submit">
                  Add category
                </Button>
              </Actions>
            </FormSection>
            <FormSection onSubmit={addItem} standalone title="Add item">
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
              <Actions>
                <Button
                  disabled={categories.length === 0}
                  icon={<Plus size={15} />}
                  tone="secondary"
                  type="submit"
                >
                  Add item
                </Button>
              </Actions>
            </FormSection>
          </div>
        </Card>
      ) : null}

      <Dialog
        description="Its stock history stays available, and the item leaves every active view now."
        footer={
          <Actions>
            <Button onClick={() => void archiveItem()} tone="danger">
              Archive item
            </Button>
            <Button onClick={() => setArchiving(null)} tone="secondary">
              Keep it
            </Button>
          </Actions>
        }
        onClose={() => setArchiving(null)}
        open={archiving !== null}
        size="sm"
        title={archiving ? `Archive ${archiving.name}?` : 'Archive item'}
      >
        <p>Counts, alerts and reorder suggestions stop including it.</p>
      </Dialog>
    </div>
  );
}
