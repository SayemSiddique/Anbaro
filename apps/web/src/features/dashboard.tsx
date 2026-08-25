'use client';

import type { DashboardReport } from '@anbaro/contracts';
import { AlertTriangle, ClipboardCheck, MapPin, PackageSearch } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
  AsyncPanel,
  Badge,
  Card,
  CardTitle,
  type Column,
  DataTable,
  Meta,
  PageSkeleton,
  StatTile,
} from '../components/ui';
import { apiErrorMessage, useSession } from '../lib/session';

type LocationRow = DashboardReport['locations'][number];
type LowStockRow = DashboardReport['lowStock'][number];

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function shortDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString() : null;
}

/**
 * Quantities arrive as numeric(14,3) strings. The dashboard has no unit to hand
 * to `formatQuantity`, so it does the one thing that is safe without one: trim
 * the stored trailing zeros and leave anything unparseable alone.
 */
function decimal(value: string | null | undefined) {
  if (value == null || value === '') return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const locationColumns: Column<LocationRow>[] = [
  {
    id: 'name',
    header: 'Location',
    cell: (row) => <span className="compact-strong">{row.name}</span>,
    sortValue: (row) => row.name,
  },
  {
    id: 'lowStock',
    header: 'Low stock',
    cell: (row) => (
      <Badge tone={row.lowStockCount ? 'warning' : 'success'} withDot>
        {plural(row.lowStockCount, 'item')}
      </Badge>
    ),
    sortValue: (row) => row.lowStockCount,
  },
  {
    id: 'conflicts',
    header: 'Open conflicts',
    cell: (row) => (
      <Badge tone={row.openConflictCount ? 'danger' : 'success'} withDot>
        {plural(row.openConflictCount, 'conflict')}
      </Badge>
    ),
    sortValue: (row) => row.openConflictCount,
  },
  {
    id: 'lastCount',
    header: 'Last count',
    cell: (row) => shortDate(row.lastCountAt) ?? 'Not finalized yet',
    // Null sorts last, which is what "never counted" deserves at the bottom of
    // an ascending sort and at the bottom of a descending one too.
    sortValue: (row) => row.lastCountAt ?? null,
  },
];

const lowStockColumns: Column<LowStockRow>[] = [
  {
    id: 'location',
    header: 'Location',
    cell: (row) => row.locationName,
    sortValue: (row) => row.locationName,
  },
  {
    id: 'item',
    header: 'Item',
    cell: (row) => <span className="compact-strong">{row.itemName}</span>,
    sortValue: (row) => row.itemName,
  },
  {
    id: 'quantity',
    header: 'On hand',
    align: 'end',
    numeric: true,
    cell: (row) => decimal(row.quantity) ?? row.quantity,
    sortValue: (row) => decimal(row.quantity),
  },
  {
    id: 'threshold',
    header: 'Threshold',
    align: 'end',
    numeric: true,
    cell: (row) => decimal(row.threshold) ?? row.threshold,
    sortValue: (row) => decimal(row.threshold),
  },
  {
    id: 'parLevel',
    header: 'Target',
    align: 'end',
    numeric: true,
    cell: (row) => decimal(row.parLevel) ?? <Meta inline>Not set</Meta>,
    sortValue: (row) => decimal(row.parLevel),
  },
];

export function DashboardFeature() {
  const { api } = useSession();
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setReport((await api.getDashboard()).data);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => void load(), [load]);

  return (
    <AsyncPanel
      error={error || null}
      hasContent={report !== null}
      loading={loading}
      loadingLabel="Loading the dashboard"
      onRetry={() => void load()}
      skeleton={<PageSkeleton body="table" tiles={4} />}
    >
      {report ? <DashboardBody report={report} /> : null}
    </AsyncPanel>
  );
}

function DashboardBody({ report }: { report: DashboardReport }) {
  const lowStockTotal = report.locations.reduce((sum, location) => sum + location.lowStockCount, 0);
  const conflictTotal = report.locations.reduce(
    (sum, location) => sum + location.openConflictCount,
    0,
  );
  const lastCount = report.locations
    .map((location) => location.lastCountAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return (
    <div className="stack">
      <div className="tile-grid">
        <StatTile
          icon={<MapPin size={15} />}
          label="Active locations"
          value={report.locations.length}
        />
        <StatTile
          icon={<PackageSearch size={15} />}
          label="Low-stock items"
          tone={lowStockTotal > 0 ? 'warning' : 'success'}
          value={lowStockTotal}
        />
        <StatTile
          icon={<AlertTriangle size={15} />}
          label="Open count conflicts"
          tone={conflictTotal > 0 ? 'danger' : 'success'}
          value={conflictTotal}
        />
        <StatTile
          icon={<ClipboardCheck size={15} />}
          label="Last finalized count"
          value={shortDate(lastCount) ?? '—'}
        />
      </div>

      <Card labelledBy="location-health">
        <CardTitle
          id="location-health"
          subtitle="Stock health and count progress for every active location."
          title="Locations"
        />
        <DataTable
          caption="Location health"
          columns={locationColumns}
          emptyHint="Add items, invite helpers, and run a first count to see operational health here."
          emptyIcon={<MapPin size={36} strokeWidth={1.5} />}
          emptyTitle="Set up your first location"
          getRowId={(row) => row.id}
          rows={report.locations}
          searchPlaceholder="Search locations"
          searchValue={(row) => row.name}
        />
      </Card>

      <Card labelledBy="aggregate-low-stock">
        <CardTitle
          id="aggregate-low-stock"
          subtitle="Items at or below their threshold across every location."
          title="Low stock"
        />
        <DataTable
          caption="Low stock across locations"
          columns={lowStockColumns}
          emptyHint="All active stock is above its threshold."
          emptyIcon={<PackageSearch size={36} strokeWidth={1.5} />}
          emptyTitle="Nothing is running low"
          filters={[
            {
              id: 'no-target',
              label: 'No target set',
              predicate: (row) => decimal(row.parLevel) === null,
            },
            {
              id: 'empty',
              label: 'Out of stock',
              predicate: (row) => (decimal(row.quantity) ?? 0) <= 0,
            },
          ]}
          getRowId={(row) => `${row.locationId}-${row.itemId}`}
          rows={report.lowStock}
          searchPlaceholder="Search items or locations"
          searchValue={(row) => `${row.itemName} ${row.locationName}`}
        />
      </Card>
    </div>
  );
}
