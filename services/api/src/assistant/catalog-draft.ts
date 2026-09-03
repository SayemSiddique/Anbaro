import { csvCell, importColumns } from '../imports/service.js';

import type { ProposedAction } from './proposal.js';

/**
 * Onboarding does not get its own write path. New items the assistant drafts are
 * emitted as a CSV for the existing `POST /imports` → preview → commit pipeline,
 * which is already staged, previewable, atomic, per-row-reporting, and creates
 * categories on the fly. New authorization surface: zero, and the import preview
 * *is* the confirmation step.
 *
 * A drafted row is only ever a suggestion — the user edits it in the preview and
 * commits, exactly as they would a CSV they wrote themselves.
 */
export function draftCatalogCsv(actions: ProposedAction[], locationName: string | null): string {
  const rows = actions.filter((action) => action.kind === 'create_item');
  if (rows.length === 0) return '';
  const body = rows.map((row) =>
    [
      row.name,
      row.unit,
      row.categoryName,
      row.categoryType,
      // Barcodes are not dictated reliably; the user scans or types them later.
      '',
      locationName ?? '',
      // A pack count with no known pack size has no total yet, so the row lands
      // with no opening quantity rather than a number nobody verified.
      row.quantity?.total === null || row.quantity === null ? '' : String(row.quantity.total),
    ]
      .map(csvCell)
      .join(','),
  );
  return `${importColumns.join(',')}\n${body.join('\n')}\n`;
}
