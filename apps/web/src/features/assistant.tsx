'use client';

import { type Location, type StockProposal } from '@anbaro/contracts';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  Field,
  Select,
  StatePanel,
} from '../components/ui';
import { apiErrorMessage, useSession } from '../lib/session';

type ProposedMovement = StockProposal['movements'][number];

/** Per-row confirm state, keyed by the movement's index in the proposal. */
type RowState =
  | { kind: 'idle' }
  | { kind: 'applying' }
  | { kind: 'applied'; resultingQuantity: string }
  | { kind: 'error'; message: string };

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
  const [error, setError] = useState('');

  const loadLocations = useCallback(async () => {
    try {
      const response = await api.getLocations();
      setLocations(response.data);
      setLocationId((current) => current || response.data[0]?.id || '');
    } catch (caught) {
      setError(apiErrorMessage(caught));
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
      <StatePanel title="Assistant isn’t enabled for your role" tone="info">
        Ask an owner or manager to grant assistant access.
      </StatePanel>
    );
  }

  const proposalLocationName =
    proposal?.locationName ??
    locations.find((location) => location.id === locationId)?.name ??
    null;

  return (
    <div className="stack">
      <Card labelledBy="assistant-title">
        <CardTitle
          id="assistant-title"
          subtitle="Describe a stock change in plain language. Nothing is written until you confirm each movement."
          title="Describe a stock change"
        />
        <form onSubmit={ask}>
          <div className="form-row" style={{ marginBottom: 12 }}>
            <Field label="Location">
              <Select onChange={(event) => setLocationId(event.target.value)} value={locationId}>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="What changed?">
            <textarea
              className="input"
              onChange={(event) => setMessage(event.target.value)}
              placeholder="e.g. we’re out of 15 limes downtown, they spoiled"
              rows={3}
              style={{ resize: 'vertical', width: '100%' }}
              value={message}
            />
          </Field>
          <div style={{ marginTop: 12 }}>
            <Button icon={<Sparkles size={15} />} loading={asking} type="submit">
              Ask assistant
            </Button>
          </div>
        </form>
      </Card>

      {error ? (
        <StatePanel title="Couldn’t reach the assistant" tone="error">
          {error}
        </StatePanel>
      ) : null}

      {proposal?.clarification ? (
        <StatePanel title="The assistant needs a bit more" tone="info">
          {proposal.clarification}
        </StatePanel>
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
          <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {proposal.movements.map((movement, index) => {
              const row = rows[index] ?? { kind: 'idle' };
              const applied = row.kind === 'applied';
              return (
                <li
                  className="card"
                  key={index}
                  style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 12 }}
                >
                  <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                    <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
                      <strong>
                        {movement.eventType === 'loss'
                          ? `Loss ${Math.abs(movement.quantityDelta)}`
                          : `Adjust ${movement.quantityDelta > 0 ? '+' : ''}${movement.quantityDelta}`}
                      </strong>
                      <Badge tone={movement.confidence === 'high' ? 'success' : 'warning'}>
                        {movement.confidence === 'high' ? 'Confident' : 'Unsure'}
                      </Badge>
                    </div>
                    <p style={{ color: 'var(--text-muted)', margin: '4px 0 0' }}>
                      Heard “{movement.itemQuery}”{movement.reason ? ` · ${movement.reason}` : ''}
                    </p>
                  </div>

                  <div style={{ flex: '1 1 220px' }}>
                    {movement.resolvedItem && movement.candidates.length === 0 ? (
                      <span style={{ alignItems: 'center', display: 'flex', gap: 6 }}>
                        <ArrowRight size={14} /> {movement.resolvedItem.name}
                      </span>
                    ) : (
                      <Field label="Item">
                        <Select
                          disabled={applied || row.kind === 'applying'}
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
                      </Field>
                    )}
                  </div>

                  <div style={{ flex: '0 0 auto' }}>
                    {applied ? (
                      <span
                        style={{
                          alignItems: 'center',
                          color: 'var(--success)',
                          display: 'flex',
                          gap: 6,
                        }}
                      >
                        <Check size={16} /> Applied · now {row.resultingQuantity}
                      </span>
                    ) : (
                      <Button
                        disabled={!chosenItem[index]}
                        loading={row.kind === 'applying'}
                        onClick={() => void confirmMovement(movement, index)}
                        tone="secondary"
                        type="button"
                      >
                        Confirm
                      </Button>
                    )}
                    {row.kind === 'error' ? (
                      <p role="alert" style={{ color: 'var(--danger)', margin: '6px 0 0' }}>
                        {row.message}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
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
