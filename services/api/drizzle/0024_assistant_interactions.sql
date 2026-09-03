-- The assistant's correction log.
--
-- Today only *confirmations* leave a trace, as `source = 'assistant'` rows in
-- stock_events. The moment a user re-picks an item the model got wrong, or walks
-- away from a bad proposal, that signal is gone — and those corrections are
-- exactly the labels a fine-tuned extraction model would learn the most from.
--
-- One row per proposed action per outcome. The utterance and the model's own
-- proposal are kept alongside what the user actually did, so a later training
-- set is a straight query rather than an archaeology project.
--
-- Append-only by grant: the app role may INSERT and SELECT, never UPDATE or
-- DELETE. Nothing here is authoritative for stock; it is evidence about the
-- model, and evidence that can be quietly rewritten is worth little.

CREATE TABLE assistant_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  -- Groups every outcome that came from one utterance, and matches the
  -- transcriptId stamped into stock_events.metadata on a confirmed write.
  transcript_id uuid NOT NULL,
  -- What the person said or typed, verbatim.
  message text NOT NULL,
  model varchar(128) NOT NULL,
  -- The action the model proposed, as it was shown to the user.
  proposed jsonb NOT NULL,
  outcome varchar(32) NOT NULL CHECK (outcome IN ('confirmed', 'corrected', 'rejected')),
  -- What the user actually confirmed, when it differed from the proposal.
  -- Null for 'confirmed' (identical) and for 'rejected' (nothing happened).
  corrected jsonb,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  -- A correction must say what it was corrected to; the other outcomes must not.
  CHECK ((outcome = 'corrected') = (corrected IS NOT NULL))
);

CREATE INDEX assistant_interactions_org_created_idx
  ON assistant_interactions (organization_id, created_at DESC);
CREATE INDEX assistant_interactions_transcript_idx
  ON assistant_interactions (organization_id, transcript_id);
-- The training query is "show me everything the model got wrong".
CREATE INDEX assistant_interactions_outcome_idx
  ON assistant_interactions (organization_id, outcome)
  WHERE outcome <> 'confirmed';

ALTER TABLE assistant_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_interactions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON assistant_interactions
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());

GRANT SELECT, INSERT ON assistant_interactions TO stock_app;
