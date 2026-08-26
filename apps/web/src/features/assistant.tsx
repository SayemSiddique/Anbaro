'use client';

import { type Location, type StockProposal } from '@anbaro/contracts';
import { Check, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

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
  FormSection,
  InlineError,
  Meta,
  Select,
  Textarea,
} from '../components/ui';
import { apiErrorMessage, useSession } from '../lib/session';

type ProposedMovement = StockProposal['movements'][number];

/** Per-row confirm state, keyed by the movement's index in the proposal. */
type RowState =
  | { kind: 'idle' }
  | { kind: 'applying' }
  | { kind: 'applied'; resultingQuantity: string }
  | { kind: 'error'; message: string };

/** A movement carries its index because that is what every per-row map is keyed by. */
type MovementRow = { index: number; movement: ProposedMovement };

export function AssistantFeature() {
  const { api, permissions } = useSession();
  const canUse = permissions.has('assistant:use');
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState('');
  const [message, setMessage] = useState('');
  const [proposal, setProposal] = useState<StockProposal | null>(null);
  // The item chosen for each movement — the resolved item by default, or a
  // candidate the user picks when the model was unsure. Keyed by movement index.
  const [chosenItem, setChosenItem] = useState<Record<number, string>>({});
  const [rows, setRows] = useState<Record<number, RowState>>({});
  const [asking, setAsking] = useState(false);
  // Two failures, two states: a dead location list must not read as a dead
  // assistant, and neither one takes the form down.
  const [locationError, setLocationError] = useState('');
  const [error, setError] = useState('');

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

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) return;
    setAsking(true);
    setError('');
    setProposal(null);
    setRows({});
    try {
      const response = await api.createStockProposal({
        message: message.trim(),
        ...(locationId ? { locationId } : {}),
      });
      setProposal(response.data);
      // Seed each row's item selection from the model's resolution.
      const seed: Record<number, string> = {};
      response.data.movements.forEach((movement, index) => {
        if (movement.resolvedItem) seed[index] = movement.resolvedItem.id;
      });
      setChosenItem(seed);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setAsking(false);
    }
  }

  async function confirmMovement(movement: ProposedMovement, index: number) {
    // The confirm location comes from the proposal (or the picker when the model
    // couldn't place it). No item, no location → nothing to write.
    const itemId = chosenItem[index];
    const targetLocationId = proposal?.locationId ?? locationId;
    if (!itemId || !targetLocationId) return;
    if (movement.eventType === 'loss' && !movement.reason) {
      setRows((prev) => ({
        ...prev,
        [index]: { kind: 'error', message: 'A loss needs a reason. Rephrase to include one.' },
      }));
      return;
    }
    setRows((prev) => ({ ...prev, [index]: { kind: 'applying' } }));
    try {
      // The model never wrote this — the user is confirming it now, through the
      // same permission-checked, idempotent, location-enforced path a manual
      // adjustment uses, stamped source: 'assistant' for a findable blast radius.
      const response = await api.createStockEvent({
        itemId,
        locationId: targetLocationId,
        eventType: movement.eventType,
        quantityDelta: movement.quantityDelta,
        idempotencyKey: crypto.randomUUID(),
        source: 'assistant',
        ...(movement.eventType === 'loss' ? { reasonCode: movement.reason ?? '' } : {}),
      });
      setRows((prev) => ({
        ...prev,
        [index]: { kind: 'applied', resultingQuantity: response.data.resultingQuantity },
      }));
    } catch (caught) {
      setRows((prev) => ({
        ...prev,
        [index]: { kind: 'error', message: apiErrorMessage(caught) },
      }));
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
    proposal?.locationName ??
    locations.find((location) => location.id === locationId)?.name ??
    null;

  const movementRows: MovementRow[] = (proposal?.movements ?? []).map((movement, index) => ({
    index,
    movement,
  }));

  const columns: Column<MovementRow>[] = [
    {
      id: 'movement',
      header: 'Movement',
      cell: ({ movement }) => (
        <div>
          <span className="compact-strong">
            {movement.eventType === 'loss' ? 'Loss' : 'Adjustment'}
          </span>{' '}
          <Badge tone={movement.confidence === 'high' ? 'success' : 'warning'}>
            {movement.confidence === 'high' ? 'Confident' : 'Unsure'}
          </Badge>
          <Meta>
            Heard “{movement.itemQuery}”{movement.reason ? ` · ${movement.reason}` : ''}
          </Meta>
        </div>
      ),
    },
    {
      id: 'quantity',
      header: 'Quantity',
      align: 'end',
      numeric: true,
      cell: ({ movement }) =>
        movement.eventType === 'loss'
          ? Math.abs(movement.quantityDelta)
          : `${movement.quantityDelta > 0 ? '+' : ''}${movement.quantityDelta}`,
    },
    {
      id: 'item',
      header: 'Item',
      cell: ({ index, movement }) => {
        const row = rows[index] ?? { kind: 'idle' };
        // A movement the model placed with no runners-up has nothing to choose
        // between, so it reads as the answer rather than as a one-option picker.
        if (movement.resolvedItem && movement.candidates.length === 0) {
          return movement.resolvedItem.name;
        }
        return (
          <Select
            aria-label={`Item for “${movement.itemQuery}”`}
            compact
            disabled={row.kind === 'applied' || row.kind === 'applying'}
            onChange={(event) =>
              setChosenItem((prev) => ({ ...prev, [index]: event.target.value }))
            }
            value={chosenItem[index] ?? ''}
          >
            <option value="">Select an item…</option>
            {[
              ...(movement.resolvedItem ? [movement.resolvedItem] : []),
              ...movement.candidates.filter(
                (candidate) => candidate.id !== movement.resolvedItem?.id,
              ),
            ].map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </Select>
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ index }) => {
        const row = rows[index] ?? { kind: 'idle' };
        if (row.kind === 'applied') {
          return (
            <div>
              <Badge tone="success" withDot>
                Applied
              </Badge>
              <Meta>
                Now <span className="numeric">{row.resultingQuantity}</span> on hand
              </Meta>
            </div>
          );
        }
        if (row.kind === 'error') {
          // Scoped to its row: one movement that will not write says nothing
          // about the three above it.
          return (
            <div role="alert">
              <Badge tone="danger" withDot>
                Didn’t apply
              </Badge>
              <Meta>{row.message}</Meta>
            </div>
          );
        }
        return <Meta inline>Nothing written yet</Meta>;
      },
    },
  ];

  return (
    <div className="stack">
      <Card labelledBy="assistant-title">
        <CardTitle
          id="assistant-title"
          subtitle="Describe a stock change in plain language. Nothing is written until you confirm each movement."
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
              placeholder="e.g. we’re out of 15 limes downtown, they spoiled"
              rows={3}
              value={message}
            />
          </Field>
          <Actions>
            <Button icon={<Sparkles size={15} />} loading={asking} type="submit">
              Ask assistant
            </Button>
          </Actions>
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

      {proposal && proposal.movements.length > 0 ? (
        <Card labelledBy="proposal-title">
          <CardTitle
            id="proposal-title"
            subtitle={
              proposalLocationName
                ? `Proposed movements at ${proposalLocationName}. Confirm the ones that look right.`
                : 'Proposed movements. Pick a location above, then confirm.'
            }
            title="Review the proposal"
          />
          <DataTable
            caption="Proposed movements"
            columns={columns}
            getRowId={({ index }) => String(index)}
            rowActions={({ index, movement }) => {
              const row = rows[index] ?? { kind: 'idle' };
              if (row.kind === 'applied') {
                return (
                  <Meta inline>
                    <Check size={14} /> Done
                  </Meta>
                );
              }
              return (
                <Button
                  disabled={!chosenItem[index]}
                  loading={row.kind === 'applying'}
                  onClick={() => void confirmMovement(movement, index)}
                  size="sm"
                  tone="secondary"
                  type="button"
                >
                  Confirm
                </Button>
              );
            }}
            rows={movementRows}
          />
        </Card>
      ) : null}

      {proposal && proposal.movements.length === 0 && !proposal.clarification ? (
        <Card>
          <EmptyState
            hint="The assistant didn’t find a stock change in that message. Try naming the item and quantity."
            icon={<Sparkles size={22} />}
            title="No movements proposed"
          />
        </Card>
      ) : null}
    </div>
  );
}
