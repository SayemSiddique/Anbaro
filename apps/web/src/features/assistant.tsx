'use client';

import {
  type Location,
  type ProposedAction,
  type ResolvedQuantity,
  type StockProposal,
} from '@anbaro/contracts';
import { ArrowRight, Check, Mic, Square, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import {
  Actions,
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  Field,
  FormSection,
  InlineError,
  Meta,
  QuietButton,
  Select,
  Textarea,
} from '../components/ui';
import { useDictation } from '../lib/dictation';
import { apiErrorMessage, useSession } from '../lib/session';

/** Per-row confirm state, keyed by the action's index in the proposal. */
type RowState =
  | { kind: 'idle' }
  | { kind: 'applying' }
  | { kind: 'applied'; detail: string }
  | { kind: 'error'; message: string };

const numberFormat = new Intl.NumberFormat();
const format = (value: number) => numberFormat.format(value);

/**
 * The arithmetic, shown rather than assumed. "5 cases × 24 = 120 each" is the
 * difference between a user who can catch a misheard "fifteen"/"fifty" before it
 * is written and one who discovers it in the ledger a week later.
 */
function QuantityMath({ quantity, unit }: { quantity: ResolvedQuantity; unit: string }) {
  if (quantity.packs === null) return null;
  if (quantity.unitsPerPack === null) {
    return (
      <Meta>
        {format(quantity.packs)} {quantity.packUnit ?? 'pack'}
        {quantity.packs === 1 ? '' : 's'} — how many {unit} in one? Say it and ask again, or set a
        pack size on the item.
      </Meta>
    );
  }
  return (
    <Meta>
      {format(quantity.packs)} {quantity.packUnit ?? 'pack'}
      {quantity.packs === 1 ? '' : 's'} × {format(quantity.unitsPerPack)} ={' '}
      <span className="numeric">{format(quantity.total ?? 0)}</span> {unit}
      {quantity.packSource === 'item' ? " (pack size from the item's record)" : ''}
    </Meta>
  );
}

/** Before → after, so a confirm is never a leap of faith. */
function Transition({ from, to, unit }: { from: number | null; to: number | null; unit?: string }) {
  if (from === null || to === null) return null;
  return (
    <p className="assistant-transition">
      <span className="numeric">{format(from)}</span>
      <ArrowRight aria-label="becomes" size={15} strokeWidth={2} />
      <span className="numeric compact-strong">{format(to)}</span>
      {unit ? <span className="assistant-unit">{unit}</span> : null}
    </p>
  );
}

function actionTitle(action: ProposedAction): string {
  switch (action.kind) {
    case 'move_stock':
      return action.eventType === 'loss' ? 'Record a loss' : 'Adjust stock';
    case 'set_stock':
      return 'Set the count';
    case 'set_threshold':
      return 'Set the low-stock level';
    case 'create_item':
      return 'Add a new item';
  }
}

export function AssistantFeature() {
  const { api, permissions } = useSession();
  const canUse = permissions.has('assistant:use');
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState('');
  const [message, setMessage] = useState('');
  const [proposal, setProposal] = useState<StockProposal | null>(null);
  // One id per proposal: it is stamped on every confirmed write and on every
  // correction-log row, so an utterance's outcomes can be reassembled later.
  const [transcriptId, setTranscriptId] = useState('');
  // The item chosen for each action — the resolved item by default, or a
  // candidate the user picks when the model was unsure. Keyed by action index.
  const [chosenItem, setChosenItem] = useState<Record<number, string>>({});
  const [rows, setRows] = useState<Record<number, RowState>>({});
  const [asking, setAsking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState('');
  // Two failures, two states: a dead location list must not read as a dead
  // assistant, and neither one takes the form down.
  const [locationError, setLocationError] = useState('');
  const [error, setError] = useState('');

  // What was typed before dictation started, so speech appends to it instead of
  // replacing work the user already did.
  const dictationBase = useRef('');
  const dictation = useDictation(
    useCallback((transcript: string) => {
      const base = dictationBase.current;
      setMessage(base ? `${base} ${transcript}` : transcript);
    }, []),
  );

  const loadLocations = useCallback(async () => {
    setLocationError('');
    try {
      const response = await api.getLocations();
      setLocations(response.data);
      setLocationId((current) => current || response.data[0]?.id || '');
    } catch (caught) {
      setLocationError(apiErrorMessage(caught));
    }
  }, [api]);
  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  function toggleDictation() {
    if (dictation.listening) {
      dictation.stop();
      return;
    }
    dictationBase.current = message.trim();
    dictation.start();
  }

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) return;
    if (dictation.listening) dictation.stop();
    setAsking(true);
    setError('');
    setImportNotice('');
    setProposal(null);
    setRows({});
    try {
      const response = await api.createStockProposal({
        message: message.trim(),
        ...(locationId ? { locationId } : {}),
      });
      setProposal(response.data);
      setTranscriptId(crypto.randomUUID());
      // Seed each row's item selection from the model's resolution.
      const seed: Record<number, string> = {};
      response.data.actions.forEach((action, index) => {
        if (action.kind !== 'create_item' && action.resolvedItem) {
          seed[index] = action.resolvedItem.id;
        }
      });
      setChosenItem(seed);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setAsking(false);
    }
  }

  const targetLocationId = proposal?.locationId ?? locationId;

  async function confirm(action: ProposedAction, index: number) {
    if (action.kind === 'create_item') return;
    const itemId = chosenItem[index];
    if (!itemId || !targetLocationId) return;
    setRows((previous) => ({ ...previous, [index]: { kind: 'applying' } }));
    try {
      if (action.kind === 'set_threshold') {
        if (action.threshold === null) throw new Error('No level to set.');
        // par_level is written back unchanged: setting a low-stock level must
        // not silently clear the target that drives reorder suggestions.
        await api.updateLocationStockLevels(itemId, {
          locationId: targetLocationId,
          threshold: action.threshold,
          parLevel: action.currentParLevel,
        });
        setRows((previous) => ({
          ...previous,
          [index]: { kind: 'applied', detail: `Low-stock level is now ${format(action.threshold!)}` },
        }));
        void recordOutcome(action, itemId);
        return;
      }

      const delta = action.quantityDelta;
      if (delta === null) throw new Error('That quantity is still unknown.');
      if (delta === 0) {
        setRows((previous) => ({
          ...previous,
          [index]: { kind: 'applied', detail: 'Already at that count — nothing to write' },
        }));
        return;
      }
      const isLoss = action.kind === 'move_stock' && action.eventType === 'loss';
      if (isLoss && !action.reason) {
        setRows((previous) => ({
          ...previous,
          [index]: { kind: 'error', message: 'A loss needs a reason. Rephrase to include one.' },
        }));
        return;
      }
      // The model never wrote this — the user is confirming it now, through the
      // same permission-checked, idempotent, location-enforced path a manual
      // adjustment uses, stamped source: 'assistant' for a findable blast radius.
      const response = await api.createStockEvent({
        itemId,
        locationId: targetLocationId,
        eventType: isLoss ? 'loss' : 'adjustment',
        quantityDelta: delta,
        idempotencyKey: crypto.randomUUID(),
        source: 'assistant',
        // Attribution, not authorization: the write was already permission-
        // checked. This is what ties the ledger row to the sentence that
        // produced it and to the correction log for the same transcript.
        assistant: { transcriptId, model: proposal?.model ?? '' },
        ...(isLoss ? { reasonCode: action.reason ?? '' } : {}),
      });
      setRows((previous) => ({
        ...previous,
        [index]: { kind: 'applied', detail: `Now ${response.data.resultingQuantity} on hand` },
      }));
      void recordOutcome(action, itemId);
    } catch (caught) {
      setRows((previous) => ({
        ...previous,
        [index]: {
          kind: 'error',
          message: caught instanceof Error ? caught.message : apiErrorMessage(caught),
        },
      }));
    }
  }

  /**
   * The correction log. A confirm where the user kept the model's item is a
   * 'confirmed'; one where they picked a different item is a 'corrected', and
   * that is the row worth training on. Failures here are deliberately silent —
   * the stock write already succeeded, and losing a training label must never
   * look to the user like losing their inventory change.
   */
  async function recordOutcome(action: ProposedAction, itemId: string) {
    if (action.kind === 'create_item' || !transcriptId) return;
    const overrode = action.resolvedItem?.id !== itemId;
    try {
      await api.recordAssistantOutcomes({
        transcriptId,
        message: message.trim(),
        outcomes: [
          {
            outcome: overrode ? 'corrected' : 'confirmed',
            proposed: action as unknown as Record<string, unknown>,
            ...(overrode ? { corrected: { itemId } } : {}),
          },
        ],
      });
    } catch {
      // Intentionally ignored — see above.
    }
  }

  /**
   * New items never get their own write path. The drafted rows go to the CSV
   * import pipeline, whose staged preview is the confirmation step — the same
   * one a hand-written CSV goes through.
   */
  async function sendDraftToImport() {
    if (!proposal?.catalogDraftCsv) return;
    setImporting(true);
    setError('');
    try {
      const initialized = await api.initializeImport({
        idempotencyKey: crypto.randomUUID(),
        filename: 'assistant-draft.csv',
      });
      if (initialized.data.uploadToken) {
        await api.uploadImport(
          initialized.data.id,
          initialized.data.uploadToken,
          proposal.catalogDraftCsv,
        );
      }
      setImportNotice(
        'Draft sent to Imports. Open Imports to review each row and commit it — nothing is added until you do.',
      );
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setImporting(false);
    }
  }

  if (!canUse) {
    return (
      <div className="stack">
        <Card>
          <EmptyState
            hint="Ask an owner or manager to grant assistant access."
            icon={<Sparkles size={36} strokeWidth={1.5} />}
            title="Assistant isn’t enabled for your role"
          />
        </Card>
      </div>
    );
  }

  const proposalLocationName =
    proposal?.locationName ?? locations.find((location) => location.id === locationId)?.name ?? null;
  const newItemCount = (proposal?.actions ?? []).filter(
    (action) => action.kind === 'create_item',
  ).length;

  return (
    <div className="stack">
      <Card labelledBy="assistant-title">
        <CardTitle
          id="assistant-title"
          subtitle="Talk or type. Nothing is written until you confirm each change."
          title="Describe a stock change"
        />
        <FormSection onSubmit={ask} standalone>
          <div className="form-row">
            <Field grow label="Location">
              <Select onChange={(event) => setLocationId(event.target.value)} value={locationId}>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {locationError ? (
            <InlineError
              detail={locationError}
              onRetry={() => void loadLocations()}
              title="Couldn’t load your locations"
            />
          ) : null}
          <Field label="What changed?">
            <Textarea
              onChange={(event) => setMessage(event.target.value)}
              placeholder="e.g. five packs of 24 Cokes came in, and we threw out 15 limes"
              rows={3}
              value={message}
            />
          </Field>
          {dictation.error ? <Meta>{dictation.error}</Meta> : null}
          <Actions>
            <Button icon={<Sparkles size={15} />} loading={asking} type="submit">
              Ask assistant
            </Button>
            {dictation.supported ? (
              <QuietButton
                aria-pressed={dictation.listening}
                icon={
                  dictation.listening ? <Square size={15} /> : <Mic aria-hidden size={15} />
                }
                onClick={toggleDictation}
                type="button"
              >
                {dictation.listening ? 'Stop dictating' : 'Dictate'}
              </QuietButton>
            ) : null}
          </Actions>
          {dictation.listening ? (
            <Meta>Listening — speak naturally, then press Stop dictating.</Meta>
          ) : null}
        </FormSection>
        {error ? (
          <div className="inline-error-stacked">
            <InlineError detail={error} title="Couldn’t reach the assistant" />
          </div>
        ) : null}
      </Card>

      {proposal?.clarification ? (
        <Card labelledBy="clarification-title">
          <CardTitle
            id="clarification-title"
            subtitle="Add the missing detail and ask again."
            title="The assistant needs a bit more"
          />
          <Meta>{proposal.clarification}</Meta>
        </Card>
      ) : null}

      {proposal && proposal.actions.length > 0 ? (
        <Card labelledBy="proposal-title">
          <CardTitle
            id="proposal-title"
            subtitle={
              proposalLocationName
                ? `At ${proposalLocationName}. Confirm each change you want written.`
                : 'Pick a location above, then confirm each change.'
            }
            title="Review before anything is written"
          />
          <div className="assistant-actions">
            {proposal.actions.map((action, index) => (
              <ActionCard
                action={action}
                chosenItemId={chosenItem[index]}
                key={index}
                onChooseItem={(itemId) =>
                  setChosenItem((previous) => ({ ...previous, [index]: itemId }))
                }
                onConfirm={() => void confirm(action, index)}
                state={rows[index] ?? { kind: 'idle' }}
              />
            ))}
          </div>
          {newItemCount > 0 ? (
            <div className="assistant-draft">
              <Meta>
                {newItemCount} new item{newItemCount === 1 ? '' : 's'} can’t be added directly —
                they go through the normal import review, where you can edit every row first.
              </Meta>
              <Actions>
                <Button
                  loading={importing}
                  onClick={() => void sendDraftToImport()}
                  tone="secondary"
                  type="button"
                >
                  Send new items to Imports
                </Button>
              </Actions>
              {importNotice ? <Meta>{importNotice}</Meta> : null}
            </div>
          ) : null}
        </Card>
      ) : null}

      {proposal && proposal.actions.length === 0 && !proposal.clarification ? (
        <Card>
          <EmptyState
            hint="Try naming the item and the quantity — “15 limes spoiled at Downtown”."
            icon={<Sparkles size={36} strokeWidth={1.5} />}
            title="No changes found in that message"
          />
        </Card>
      ) : null}
    </div>
  );
}

function ActionCard({
  action,
  chosenItemId,
  onChooseItem,
  onConfirm,
  state,
}: {
  action: ProposedAction;
  chosenItemId: string | undefined;
  onChooseItem: (itemId: string) => void;
  onConfirm: () => void;
  state: RowState;
}) {
  const busy = state.kind === 'applying' || state.kind === 'applied';

  if (action.kind === 'create_item') {
    return (
      <section className="assistant-action">
        <header className="assistant-action-head">
          <span className="compact-strong">{actionTitle(action)}</span>
          <Badge tone="info">New</Badge>
        </header>
        <p className="assistant-action-line">
          <span className="compact-strong">{action.name}</span>
          <Meta inline>
            {action.unit} · {action.categoryName}
          </Meta>
        </p>
        {action.quantity?.total !== null && action.quantity ? (
          <Meta>Opening stock {format(action.quantity.total ?? 0)}</Meta>
        ) : null}
        {action.quantity ? <QuantityMath quantity={action.quantity} unit={action.unit} /> : null}
        {action.duplicateOf ? (
          <Meta>
            Careful — “{action.duplicateOf.name}” is already in your catalog. Adding this would
            create a second entry.
          </Meta>
        ) : null}
        <Meta>Added through the import review below, not written directly.</Meta>
      </section>
    );
  }

  const unit = action.resolvedItem?.unit ?? '';
  const options = [
    ...(action.resolvedItem ? [action.resolvedItem] : []),
    ...action.candidates.filter((candidate) => candidate.id !== action.resolvedItem?.id),
  ];

  return (
    <section className="assistant-action">
      <header className="assistant-action-head">
        <span className="compact-strong">{actionTitle(action)}</span>
        <Badge tone={action.confidence === 'high' ? 'success' : 'warning'}>
          {action.confidence === 'high' ? 'Confident' : 'Unsure'}
        </Badge>
      </header>

      <Meta>
        Heard “{action.itemQuery}”
        {action.kind === 'move_stock' && action.reason ? ` · ${action.reason}` : ''}
      </Meta>

      {/* An item the model placed with no runners-up reads as the answer rather
          than as a one-option picker. */}
      {action.resolvedItem && action.candidates.length <= 1 ? (
        <p className="assistant-action-line">
          <span className="compact-strong">{action.resolvedItem.name}</span>
        </p>
      ) : (
        <Field label={`Which item did you mean by “${action.itemQuery}”?`}>
          <Select
            compact
            disabled={busy}
            onChange={(event) => onChooseItem(event.target.value)}
            value={chosenItemId ?? ''}
          >
            <option value="">Select an item…</option>
            {options.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <QuantityMath quantity={action.quantity} unit={unit || 'units'} />

      {action.kind === 'set_threshold' ? (
        <Transition from={action.currentThreshold} to={action.threshold} unit={unit} />
      ) : action.kind === 'set_stock' ? (
        <Transition from={action.currentQuantity} to={action.targetQuantity} unit={unit} />
      ) : (
        <Transition from={action.currentQuantity} to={action.resultingQuantity} unit={unit} />
      )}

      {state.kind === 'applied' ? (
        <p className="assistant-applied">
          <Check aria-hidden size={16} strokeWidth={2.2} />
          <Badge tone="success" withDot>
            Applied
          </Badge>
          <Meta inline>{state.detail}</Meta>
        </p>
      ) : (
        <Actions>
          <Button
            disabled={!chosenItemId}
            loading={state.kind === 'applying'}
            onClick={onConfirm}
            tone="secondary"
            type="button"
          >
            Confirm this change
          </Button>
        </Actions>
      )}
      {state.kind === 'error' ? (
        // Scoped to its row: one change that will not write says nothing about
        // the ones above it.
        <div role="alert">
          <Badge tone="danger" withDot>
            Didn’t apply
          </Badge>
          <Meta>{state.message}</Meta>
        </div>
      ) : null}
    </section>
  );
}
