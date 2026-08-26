import type { Category, ItemWithStock, Location, StockEvent } from '@anbaro/contracts';
import { ApiClientError, fitsStockQuantity } from '@anbaro/contracts';
import { formatQuantity, packDescription, unitShortLabel } from '@anbaro/design-tokens';
import { ScanLine } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useMobileSession } from '../../src/components/app-shell';
import { BarcodeScannerModal } from '../../src/components/barcode-scanner';
import {
  CategoryTile,
  Chip,
  PrimaryButton,
  QuietButton,
  SecondaryButton,
  SkeletonRows,
  StatePanel,
  StockConditionBadge,
  UnitPicker,
} from '../../src/components/ui';
import { makeStyles, text } from '../../src/lib/theme';

type ScanTarget = 'lookup' | 'new-item';

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

export default function ItemsScreen() {
  const styles = useStyles();
  const { state, controller } = useMobileSession();
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [items, setItems] = useState<ItemWithStock[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedItem, setSelectedItem] = useState<ItemWithStock | null>(null);
  const [history, setHistory] = useState<StockEvent[]>([]);
  const [search, setSearch] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newItem, setNewItem] = useState('');
  const [unit, setUnit] = useState('each');
  const [customUnit, setCustomUnit] = useState('');
  const [packSize, setPackSize] = useState('');
  const [packUnit, setPackUnit] = useState('');
  const [barcode, setBarcode] = useState('');
  const [quantity, setQuantity] = useState('');
  const [lossReason, setLossReason] = useState('');
  const [movementType, setMovementType] = useState<'adjustment' | 'loss'>('adjustment');
  const [scanTarget, setScanTarget] = useState<ScanTarget | null>(null);
  // A catalog form that will not save says nothing about the item list, and
  // neither one belongs to the movement panel.
  const [listError, setListError] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const permissions =
    state.kind === 'ready'
      ? new Set(
          state.user.memberships.find(
            (membership) => membership.organizationId === state.user.activeOrganizationId,
          )?.permissions ?? [],
        )
      : new Set<string>();
  const canWrite = permissions.has('item:write');
  const canAdjust = permissions.has('stock:write');
  const canScan = Platform.OS !== 'web';

  const load = useCallback(async () => {
    if (state.kind !== 'ready' || !state.user.activeOrganizationId) return;
    setLoading(true);
    try {
      const [categoryResponse, locationResponse] = await Promise.all([
        controller.getCategories(),
        controller.getLocations(),
      ]);
      const locationId = selectedLocationId || locationResponse.data[0]?.id || '';
      setCategories(categoryResponse.data);
      setLocations(locationResponse.data);
      setSelectedLocationId(locationId);
      setItems(
        (
          await controller.getItems({
            ...(locationId ? { locationId } : {}),
            ...(selectedCategoryId ? { categoryId: selectedCategoryId } : {}),
            ...(search ? { search } : {}),
          })
        ).data,
      );
      setListError('');
    } catch (caught) {
      setListError(caught instanceof ApiClientError ? caught.message : 'Could not load items.');
    } finally {
      setLoading(false);
    }
  }, [controller, search, selectedCategoryId, selectedLocationId, state]);
  useEffect(() => {
    void load();
  }, [load]);

  async function selectItem(item: ItemWithStock) {
    setSelectedItem(item);
    if (!selectedLocationId) return;
    try {
      setHistory((await controller.getStockEvents(item.id, selectedLocationId)).data);
    } catch (caught) {
      setDetailError(
        caught instanceof ApiClientError ? caught.message : 'Could not load movement history.',
      );
    }
  }
  async function handleScan(scanned: string) {
    const target = scanTarget;
    setScanTarget(null);
    setNotice('');
    if (target === 'new-item') {
      setBarcode(scanned);
      return;
    }
    try {
      const found = (await controller.getItemByBarcode(scanned)).data;
      const withStock = items.find((item) => item.id === found.id) ?? found;
      await selectItem(withStock as ItemWithStock);
      setNotice(`Found ${found.name} for barcode ${scanned}.`);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 404) {
        setBarcode(scanned);
        setNotice(`No item uses barcode ${scanned} yet — it's been filled into the new-item form.`);
      } else {
        setListError(caught instanceof ApiClientError ? caught.message : 'Barcode lookup failed.');
      }
    }
  }
  async function addCategory() {
    if (!newCategory.trim()) return;
    setCatalogError('');
    try {
      await controller.createCategory(newCategory, 'other');
      setNewCategory('');
      await load();
    } catch (caught) {
      setCatalogError(
        caught instanceof ApiClientError ? caught.message : 'Could not add category.',
      );
    }
  }
  async function addItem() {
    const finalUnit = customUnit.trim().toLowerCase() || unit;
    if (!newItem.trim() || !finalUnit || !selectedCategoryId) return;
    const parsedPackSize = Number(packSize);
    setCatalogError('');
    try {
      await controller.createItem({
        categoryId: selectedCategoryId,
        name: newItem,
        unit: finalUnit,
        ...(parsedPackSize > 0 && packUnit.trim()
          ? { packSize: parsedPackSize, packUnit: packUnit.trim().toLowerCase() }
          : {}),
        barcodeIdentifier: barcode || null,
      });
      setNewItem('');
      setCustomUnit('');
      setPackSize('');
      setPackUnit('');
      setBarcode('');
      await load();
    } catch (caught) {
      setCatalogError(caught instanceof ApiClientError ? caught.message : 'Could not add item.');
    }
  }
  async function recordMovement() {
    if (
      !selectedItem ||
      !selectedLocationId ||
      !quantity ||
      (movementType === 'loss' && !lossReason.trim())
    )
      return;
    const entered = Number(quantity);
    if (!Number.isFinite(entered) || entered === 0) return;
    setDetailError('');
    if (!fitsStockQuantity(entered)) {
      setDetailError('Enter a quantity with at most 3 decimal places.');
      return;
    }
    try {
      await controller.createStockEvent({
        itemId: selectedItem.id,
        locationId: selectedLocationId,
        eventType: movementType,
        quantityDelta: movementType === 'loss' ? -Math.abs(entered) : entered,
        idempotencyKey: uuid(),
        ...(movementType === 'loss' ? { reasonCode: lossReason } : {}),
      });
      setQuantity('');
      setLossReason('');
      await selectItem(selectedItem);
      await load();
    } catch (caught) {
      setDetailError(
        caught instanceof ApiClientError ? caught.message : 'Could not record stock movement.',
      );
    }
  }
  if (state.kind !== 'ready') return null;
  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={styles.title}>
        Items
      </Text>
      <Text style={styles.detail}>
        Everything you stock, grouped by category. Pick a location to see live quantities.
      </Text>
      {/* The library names scanning as the tinted-quiet case: readily available
          in a stockroom without spending the screen's one filled primary. */}
      {canScan ? (
        <QuietButton emphasis="tinted" icon={ScanLine} onPress={() => setScanTarget('lookup')}>
          Scan a barcode
        </QuietButton>
      ) : null}
      <Text style={styles.label}>Location</Text>
      <View style={styles.chipRow}>
        {locations.map((location) => (
          <Chip
            key={location.id}
            label={location.name}
            onPress={() => setSelectedLocationId(location.id)}
            selected={location.id === selectedLocationId}
          />
        ))}
      </View>
      <Text style={styles.label}>Category</Text>
      <View style={styles.chipRow}>
        <Chip
          label="All"
          onPress={() => setSelectedCategoryId('')}
          selected={!selectedCategoryId}
        />
        {categories.map((category) => (
          <Chip
            key={category.id}
            label={category.name}
            onPress={() => setSelectedCategoryId(category.id)}
            selected={category.id === selectedCategoryId}
          />
        ))}
      </View>
      <TextInput
        accessibilityLabel="Search items"
        onChangeText={setSearch}
        onSubmitEditing={() => void load()}
        placeholder="Search name or barcode"
        returnKeyType="search"
        style={styles.input}
        value={search}
      />
      {notice ? <StatePanel detail={notice} title="Barcode scan" /> : null}
      {listError ? (
        <StatePanel
          action={<SecondaryButton onPress={() => void load()}>Try again</SecondaryButton>}
          detail={listError}
          title="Couldn’t load your items"
          tone="error"
        />
      ) : null}
      {loading ? (
        <SkeletonRows label="Loading items" rows={3} />
      ) : items.length === 0 ? (
        <StatePanel
          detail="Add a category and item to begin tracking stock."
          title="No items yet"
        />
      ) : (
        items.map((item) => {
          const pack = packDescription(item.unit, item.packSize, item.packUnit);
          return (
            <Pressable
              accessibilityRole="button"
              key={item.id}
              onPress={() => void selectItem(item)}
              style={({ pressed }) => [styles.itemCard, pressed && styles.itemCardPressed]}
            >
              <CategoryTile icon={item.categoryIcon} name={item.categoryName} size={40} />
              <View style={styles.itemBody}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemMeta}>
                  {item.categoryName}
                  {pack ? ` · ${pack}` : ''}
                </Text>
              </View>
              <View style={styles.itemRight}>
                <Text style={styles.itemQuantity}>
                  {formatQuantity(item.quantity, item.unit)}{' '}
                  <Text style={styles.itemUnit}>{unitShortLabel(item.unit)}</Text>
                </Text>
                {item.stockCondition ? (
                  <StockConditionBadge condition={item.stockCondition} />
                ) : null}
              </View>
            </Pressable>
          );
        })
      )}
      {canWrite ? (
        <View style={styles.panel}>
          <Text accessibilityRole="header" style={styles.section}>
            Add to catalog
          </Text>
          <TextInput
            accessibilityLabel="New category name"
            onChangeText={setNewCategory}
            placeholder="New category (icon is generated automatically)"
            style={styles.input}
            value={newCategory}
          />
          <SecondaryButton disabled={!newCategory.trim()} onPress={() => void addCategory()}>
            Add category
          </SecondaryButton>
          <Text style={styles.label}>Item category</Text>
          <View style={styles.chipRow}>
            {categories.map((category) => (
              <Chip
                key={category.id}
                label={category.name}
                onPress={() => setSelectedCategoryId(category.id)}
                selected={category.id === selectedCategoryId}
              />
            ))}
          </View>
          <TextInput
            accessibilityLabel="Item name"
            onChangeText={setNewItem}
            placeholder="Item name"
            style={styles.input}
            value={newItem}
          />
          <Text style={styles.label}>Unit</Text>
          <UnitPicker
            onSelect={(code) => {
              setUnit(code);
              setCustomUnit('');
            }}
            selected={customUnit ? '' : unit}
          />
          <TextInput
            accessibilityLabel="Custom unit"
            autoCapitalize="none"
            maxLength={32}
            onChangeText={setCustomUnit}
            placeholder="Custom unit (only if not listed)"
            style={styles.input}
            value={customUnit}
          />
          <Text style={styles.label}>Pack conversion (optional)</Text>
          <View style={styles.packRow}>
            <TextInput
              accessibilityLabel="Units per pack"
              keyboardType="decimal-pad"
              onChangeText={setPackSize}
              placeholder="Units per pack, e.g. 24"
              style={[styles.input, styles.packInput]}
              value={packSize}
            />
            <TextInput
              accessibilityLabel="Pack unit"
              autoCapitalize="none"
              maxLength={32}
              onChangeText={setPackUnit}
              placeholder="Pack unit, e.g. case"
              style={[styles.input, styles.packInput]}
              value={packUnit}
            />
          </View>
          <View style={styles.packRow}>
            <TextInput
              accessibilityLabel="Item barcode"
              autoCapitalize="none"
              onChangeText={setBarcode}
              placeholder="Barcode (optional)"
              style={[styles.input, styles.packInput]}
              value={barcode}
            />
            {canScan ? (
              <SecondaryButton onPress={() => setScanTarget('new-item')}>Scan</SecondaryButton>
            ) : null}
          </View>
          <SecondaryButton
            disabled={!newItem.trim() || !(customUnit.trim() || unit) || !selectedCategoryId}
            onPress={() => void addItem()}
          >
            Add item
          </SecondaryButton>
          {catalogError ? (
            <StatePanel detail={catalogError} title="Couldn’t save that" tone="error" />
          ) : null}
        </View>
      ) : null}
      {selectedItem ? (
        <View style={styles.panel}>
          <View style={styles.detailHeader}>
            <CategoryTile
              icon={selectedItem.categoryIcon}
              name={selectedItem.categoryName}
              size={40}
            />
            <Text accessibilityRole="header" style={styles.section}>
              {selectedItem.name}
            </Text>
          </View>
          <Text style={styles.detail}>
            Movement history is immutable and shows who recorded each change.
          </Text>
          {canAdjust && selectedLocationId ? (
            <>
              <Text style={styles.label}>Movement type</Text>
              <View style={styles.chipRow}>
                <Chip
                  label="Adjustment"
                  onPress={() => setMovementType('adjustment')}
                  selected={movementType === 'adjustment'}
                />
                <Chip
                  label="Mark lost"
                  onPress={() => setMovementType('loss')}
                  selected={movementType === 'loss'}
                />
              </View>
              <TextInput
                accessibilityLabel="Movement quantity"
                keyboardType="decimal-pad"
                onChangeText={setQuantity}
                placeholder={movementType === 'loss' ? 'Loss quantity' : 'Change, e.g. -2 or 4'}
                style={styles.input}
                value={quantity}
              />
              {movementType === 'loss' ? (
                <TextInput
                  accessibilityLabel="Loss reason"
                  onChangeText={setLossReason}
                  placeholder="Loss reason"
                  style={styles.input}
                  value={lossReason}
                />
              ) : null}
              <PrimaryButton
                disabled={!quantity || (movementType === 'loss' && !lossReason.trim())}
                onPress={() => void recordMovement()}
              >
                Record movement
              </PrimaryButton>
            </>
          ) : null}
          {detailError ? (
            <StatePanel detail={detailError} title="Couldn’t update this item" tone="error" />
          ) : null}
          {history.length ? (
            history.map((event) => (
              <Text key={event.id} style={styles.history}>
                {event.eventType}:{' '}
                <Text style={styles.historyQuantity}>
                  {formatQuantity(event.quantityDelta, selectedItem.unit)}
                </Text>{' '}
                →{' '}
                <Text style={styles.historyQuantity}>
                  {formatQuantity(event.resultingQuantity, selectedItem.unit)}
                </Text>
                {event.reasonCode ? ` (${event.reasonCode})` : ''} ·{' '}
                {event.actorName ?? event.actorUserId}
              </Text>
            ))
          ) : (
            <Text style={styles.detail}>No movements recorded at this location.</Text>
          )}
        </View>
      ) : null}
      <BarcodeScannerModal
        onClose={() => setScanTarget(null)}
        onScanned={(value) => void handleScan(value)}
        visible={scanTarget !== null}
      />
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  content: { gap: 12, padding: 16 },
  detail: { ...text.body, color: c.inkMuted },
  detailHeader: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  history: { ...text.body, color: c.ink },
  historyQuantity: { ...text.numeric, color: c.ink },
  input: {
    ...text.body,
    backgroundColor: c.surface,
    borderColor: c.hairlineFirm,
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  itemBody: { flex: 1, gap: 2 },
  itemCard: {
    alignItems: 'center',
    backgroundColor: c.surface,
    borderColor: c.hairline,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  itemCardPressed: { backgroundColor: c.surface2 },
  itemMeta: { ...text.body, color: c.inkMuted },
  itemName: { ...text.heading, color: c.ink },
  itemQuantity: { ...text.numeric, color: c.ink },
  itemRight: { alignItems: 'flex-end', gap: 6 },
  itemUnit: { ...text.body, color: c.inkMuted },
  label: { ...text.label, color: c.inkMuted },
  packInput: { flex: 1 },
  packRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  panel: {
    borderColor: c.hairline,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  section: { ...text.title, color: c.ink },
  title: { ...text.display, color: c.ink },
}));
