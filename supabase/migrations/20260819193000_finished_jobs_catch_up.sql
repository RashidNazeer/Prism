-- ============================================================================
-- THE JOBS THE OLD RULE LEFT BEHIND, 2026-08-19
--
-- The migration before this one changed where a finished job lands: approving
-- the last video now carries it to `payment_pending` rather than
-- `content_completed`. That only governs approvals made from now on.
--
-- Jobs that finished BEFORE the change are sitting at `content_completed`, in
-- the `working` money bucket, with nothing left to do and nothing that will
-- ever move them: they finished, so no further approval will fire the advance
-- branch again. Left alone they would wait there for ever while every job
-- finished after today walked past them.
--
-- So they catch up, once, here. Only jobs that are genuinely filmed by the
-- database's own definition (`job_is_filmed`, which reads the count frozen at
-- approval and counts approved submissions only), and only from
-- `content_completed`. Nothing at `paid` is touched, nothing part-filmed is
-- touched, and no job is invented into existence.
--
-- The creator gets a real stage event, because this shows up on their dashboard
-- timeline and an unexplained jump from "being checked" to "awaiting payment"
-- reads as a glitch. `actor_id` is null: no person clicked this, and naming one
-- would put a lie in the history.
-- ============================================================================

with finished as (
  select a.id, a.creator_id, a.committed_video_count
  from public.offer_applications a
  where a.status = 'approved'
    and a.stage = 'content_completed'
    and public.job_is_filmed(a.id)
),
moved as (
  update public.offer_applications a
  set stage = 'payment_pending', stage_updated_at = now()
  from finished f
  where a.id = f.id
  returning a.id, a.creator_id, a.committed_video_count
)
insert into public.offer_stage_events (
  application_id, creator_id, from_stage, to_stage, note, actor_id
)
select
  m.id,
  m.creator_id,
  'content_completed',
  'payment_pending',
  'All ' || m.committed_video_count ||
    ' videos are in and approved. Your payment is being arranged.',
  null
from moved m;
