'use client';

import type { ImportBatch } from '@anbaro/contracts';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import {
  Actions,
  Badge,
  Button,
  Card,
  CardTitle,
  type Column,
  DataTable,
  EmptyState,
  Field,
  InlineError,
  Input,
  StatTile,
} from '../components/ui';
import { apiErrorMessage, useSession } from '../lib/session';

type ImportRow = ImportBatch['rows'][number];

function downloadCsv(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const statusTones: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  committed: 'success',
  preview: 'info',
  validating: 'neutral',
  failed: 'danger',
};

function rowDetail(row: ImportRow) {
  return [...row.errors, ...row.warnings].join(' ') || 'Ready to import.';
}

const rowColumns: Column<ImportRow>[] = [
  {
    id: 'rowNumber',
    header: 'Row',
    align: 'end',
    numeric: true,
    width: '72px',
    cell: (row) => row.rowNumber,
    sortValue: (row) => row.rowNumber,
  },
  {
    id: 'name',
    header: 'Item',
    cell: (row) => <span className="compact-strong">{row.name ?? '—'}</span>,
    sortValue: (row) => row.name ?? null,
  },
  {
    id: 'category',
    header: 'Category',
    cell: (row) => row.category ?? '—',
    sortValue: (row) => row.category ?? null,
  },
  {
    id: 'barcode',
    header: 'Barcode',
    cell: (row) => row.barcodeIdentifier ?? '—',
    sortValue: (row) => row.barcodeIdentifier ?? null,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => (
      <Badge tone={row.status === 'valid' ? 'success' : row.errors.length ? 'danger' : 'neutral'}>
        {row.status}
      </Badge>
    ),
    sortValue: (row) => row.status,
  },
  { id: 'detail', header: 'Details', cell: rowDetail },
];

export function ImportsFeature() {
  const { api, isOwner } = useSession();
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  async function refresh(id: string): Promise<ImportBatch> {
    const next = (await api.getImport(id)).data;
    setBatch(next);
    return next;
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = (new FormData(event.currentTarget).get('csv') as File | null) ?? null;
    if (!file) {
      setError('Choose a CSV file first.');
      return;
    }
    setWorking(true);
    setError('');
    try {
      const initialized = await api.initializeImport({
        idempotencyKey: crypto.randomUUID(),
        filename: file.name,
      });
      if (!initialized.data.uploadUrl || !initialized.data.uploadToken) {
        await refresh(initialized.data.id);
        return;
      }
      await api.uploadImport(initialized.data.id, initialized.data.uploadToken, await file.text());
      const poll = async (): Promise<void> => {
        const next = await refresh(initialized.data.id);
        if (next.status === 'validating') window.setTimeout(() => void poll(), 500);
      };
      await poll();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setWorking(false);
    }
  }
  async function commit() {
    if (!batch) return;
    setWorking(true);
    setError('');
    try {
      setBatch((await api.commitImport(batch.id)).data);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="stack">
      <Card labelledBy="csv-import-title">
        <CardTitle
          action={
            <Actions>
              <Button
                icon={<Download size={14} />}
                onClick={() =>
                  void api
                    .getImportTemplate()
                    .then((content) => downloadCsv('item-import-template.csv', content))
                }
                size="sm"
                tone="secondary"
              >
                CSV template
              </Button>
              {isOwner ? (
                <Button
                  icon={<Download size={14} />}
                  onClick={() =>
                    void api
                      .exportOrganization()
                      .then((content) => downloadCsv('organization-stock-export.csv', content))
                  }
                  size="sm"
                  tone="secondary"
                >
                  Export organization
                </Button>
              ) : null}
            </Actions>
          }
          id="csv-import-title"
          subtitle="Upload the template, review every row, then import only the valid rows."
          title="Import items from CSV"
        />
        <form className="form-row" onSubmit={upload}>
          <Field label="CSV file">
            <Input accept=".csv,text/csv" name="csv" required type="file" />
          </Field>
          <Button icon={<Upload size={15} />} loading={working} type="submit">
            Upload and validate
          </Button>
        </form>
        {/* The upload failed, so the preview below — if any — is still valid.
            Scoping the error to this card is the whole point of InlineError. */}
        {error ? (
          <div className="inline-error-stacked">
            <InlineError detail={error} title="Couldn’t import this file" />
          </div>
        ) : null}
      </Card>

      {batch ? (
        <Card labelledBy="import-preview-title">
          <div aria-live="polite">
            <CardTitle
              action={<Badge tone={statusTones[batch.status] ?? 'neutral'}>{batch.status}</Badge>}
              id="import-preview-title"
              subtitle={`${batch.summary.rows} rows · ${batch.summary.valid} valid · ${batch.summary.errors} need fixes`}
              title="Import preview"
            />
            {batch.status === 'failed' ? (
              <InlineError detail={batch.failureReason} title="This file needs a fix" />
            ) : null}
            {batch.status === 'committed' ? (
              <div className="tile-grid">
                <StatTile label="Created" tone="success" value={batch.summary.created} />
                <StatTile label="Updated" value={batch.summary.updated} />
                <StatTile label="Skipped" value={batch.summary.skipped} />
              </div>
            ) : null}
            {batch.rows.length ? (
              <DataTable
                caption="Import preview rows"
                columns={rowColumns}
                emptyHint="Every row in this file was filtered out of the current view."
                emptyTitle="No rows match"
                filters={[
                  {
                    id: 'needs-fixes',
                    label: 'Needs fixes',
                    predicate: (row) => row.errors.length > 0,
                  },
                  { id: 'valid', label: 'Valid', predicate: (row) => row.status === 'valid' },
                ]}
                getRowId={(row) => row.id}
                loading={batch.status === 'validating'}
                rows={batch.rows}
                searchPlaceholder="Search rows"
                searchValue={(row) =>
                  `${row.rowNumber} ${row.name ?? ''} ${row.category ?? ''} ${
                    row.barcodeIdentifier ?? ''
                  } ${rowDetail(row)}`
                }
              />
            ) : null}
            {batch.status === 'preview' ? (
              <Actions>
                <Button
                  disabled={working || batch.summary.valid === 0}
                  loading={working}
                  onClick={() => void commit()}
                >
                  {batch.summary.errors ? 'Commit valid rows only' : 'Commit all rows'}
                </Button>
                {batch.summary.errors ? (
                  <Button
                    icon={<Download size={14} />}
                    onClick={() =>
                      void api
                        .getImportErrorReport(batch.id)
                        .then((content) => downloadCsv('import-errors.csv', content))
                    }
                    tone="secondary"
                  >
                    Download error report
                  </Button>
                ) : null}
              </Actions>
            ) : null}
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState
            hint="Download the CSV template, fill in your items, and upload it above."
            icon={<FileSpreadsheet size={36} strokeWidth={1.5} />}
            title="No import in progress"
          />
        </Card>
      )}
    </div>
  );
}
