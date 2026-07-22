'use client';

import type { ImportBatch } from '@anbaro/contracts';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { Badge, Button, Card, CardTitle, Field, Input, StatePanel } from '../components/ui';
import { apiErrorMessage, useSession } from '../lib/session';

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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
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
            </div>
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
              <StatePanel title="This file needs a fix" tone="error">
                {batch.failureReason}
              </StatePanel>
            ) : null}
            {batch.rows.length ? (
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Item</th>
                      <th>Category</th>
                      <th>Barcode</th>
                      <th>Status</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batch.rows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.rowNumber}</td>
                        <td>{row.name ?? '—'}</td>
                        <td>{row.category ?? '—'}</td>
                        <td>{row.barcodeIdentifier ?? '—'}</td>
                        <td>
                          <Badge
                            tone={
                              row.status === 'valid'
                                ? 'success'
                                : row.errors.length
                                  ? 'danger'
                                  : 'neutral'
                            }
                          >
                            {row.status}
                          </Badge>
                        </td>
                        <td>{[...row.errors, ...row.warnings].join(' ') || 'Ready to import.'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {batch.status === 'preview' ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
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
              </div>
            ) : null}
            {batch.status === 'committed' ? (
              <div style={{ marginTop: 16 }}>
                <StatePanel title="Import complete">
                  {batch.summary.created} created, {batch.summary.updated} updated, and{' '}
                  {batch.summary.skipped} skipped.
                </StatePanel>
              </div>
            ) : null}
          </div>
        </Card>
      ) : (
        <Card>
          <div className="empty-state">
            <FileSpreadsheet size={36} strokeWidth={1.5} />
            <h3>No import in progress</h3>
            <p>Download the CSV template, fill in your items, and upload it above.</p>
          </div>
        </Card>
      )}

      {error ? (
        <StatePanel title="Couldn’t import this file" tone="error">
          {error}
        </StatePanel>
      ) : null}
    </div>
  );
}
