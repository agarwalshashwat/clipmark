-- Manual ordering for user-created groups (rename/reorder parity with the
-- extension dashboard's Groups view, which persists a reorderable list —
-- see extension/src/popup/dashboard.js's saveVideoGroups/renderGroupsView
-- move-up/move-down buttons). The web dashboard previously had no way to
-- persist a custom order; groups were always listed by created_at.
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows into a stable order (newest first, matching the
-- order the UI already showed before this column existed) so reordering
-- starts from a sensible baseline instead of every row tying at 0.
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) - 1 AS rn
  FROM public.groups
)
UPDATE public.groups g
SET position = ordered.rn
FROM ordered
WHERE g.id = ordered.id AND g.position = 0;

CREATE INDEX IF NOT EXISTS idx_groups_user_position ON public.groups (user_id, position);
