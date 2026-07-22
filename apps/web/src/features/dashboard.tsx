'use client';

import type { DashboardReport } from '@anbaro/contracts';
import { AlertTriangle, ClipboardCheck, MapPin, PackageSearch } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Badge, Button, Card, CardTitle, EmptyState, StatePanel, StatTile } from '../components/ui';
import { apiErrorMessage, useSession } from '../lib/session';

export function DashboardFeature() {
  const { api } = useSession();
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      setReport((await api.getDashboard()).data);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }, [api]);
  useEffect(() => void load(), [load]);

  if (error)
    return (
      <StatePanel
        action={<Button onClick={() => void load()}>Try again</Button>}
        title="Couldn’t load the dashboard"
        tone="error"
      >
        {error}
      </StatePanel>
    );
  if (!report)
    return <StatePanel title="Loading dashboard">Preparing your cross-location view…</StatePanel>;

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
          value={lastCount ? new Date(lastCount).toLocaleDateString() : '—'}
        />
      </div>

      {report.locations.length === 0 ? (
        <Card>
          <EmptyState
            hint="Add items, invite helpers, and run a first count to see operational health here."
            icon={<MapPin size={36} strokeWidth={1.5} />}
            title="Set up your first location"
          />
        </Card>
      ) : (
        <Card labelledBy="location-health">
          <CardTitle
            id="location-health"
            subtitle="Stock health and count progress for every active location."
            title="Locations"
          />
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Low stock</th>
                  <th>Open conflicts</th>
                  <th>Last count</th>
                </tr>
              </thead>
              <tbody>
                {report.locations.map((location) => (
                  <tr key={location.id}>
                    <td style={{ fontWeight: 600 }}>{location.name}</td>
                    <td>
                      <Badge tone={location.lowStockCount ? 'warning' : 'success'} withDot>
                        {location.lowStockCount} item{location.lowStockCount === 1 ? '' : 's'}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={location.openConflictCount ? 'danger' : 'success'} withDot>
                        {location.openConflictCount} conflict
                        {location.openConflictCount === 1 ? '' : 's'}
                      </Badge>
                    </td>
                    <td>
                      {location.lastCountAt
                        ? new Date(location.lastCountAt).toLocaleDateString()
                        : 'Not finalized yet'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card labelledBy="aggregate-low-stock">
        <CardTitle
          id="aggregate-low-stock"
          subtitle="Items at or below their threshold across every location."
          title="Low stock"
        />
        {report.lowStock.length === 0 ? (
          <EmptyState
            hint="All active stock is above its threshold."
            icon={<PackageSearch size={36} strokeWidth={1.5} />}
            title="Nothing is running low"
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Item</th>
                  <th>On hand</th>
                  <th>Threshold</th>
                  <th>Target</th>
                </tr>
              </thead>
              <tbody>
                {report.lowStock.map((row) => (
                  <tr key={`${row.locationId}-${row.itemId}`}>
                    <td>{row.locationName}</td>
                    <td style={{ fontWeight: 600 }}>{row.itemName}</td>
                    <td>{row.quantity}</td>
                    <td>{row.threshold}</td>
                    <td>{row.parLevel ?? 'Not set'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
