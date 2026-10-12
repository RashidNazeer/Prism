import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DataError } from '@/components/ui/DataState';
import { Field, Input } from '@/components/ui/Field';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';
import { useApplication } from '@/lib/auth/useApplication';
import { ROLE_LABEL, TIER_LABEL } from '@/lib/tiers';
import { TikTokConnection } from '@/components/creator/TikTokConnection';

// Moved to src/lib/tiers.ts on 2026-08-11, because the admin creator screens
// print the same words and two copies of a label is how they drift.

/** Blank is allowed (it clears the name); anything else is trimmed and capped. */
const displayNameSchema = z.string().trim().max(60, 'Keep your name under 60 characters');

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

/**
 * The creator's own account: identity and settings, nothing heavier.
 *
 * Four things, in this order: their TikTok connection, their display name, the
 * account facts, and the application they sent. Theme and text size are NOT
 * here: both already live in the top bar, and a second control for the same
 * setting is worse than one. There are no notification settings either, because
 * nothing in the database stores any, and a switch that saves nowhere is a lie.
 *
 * Display name is the ONLY thing editable, and that is a database decision
 * rather than a UI one: `display_name` is the single column granted to
 * `authenticated` on this table. Role, tier and email are not editable by the
 * person they belong to, and the escalation guard would refuse anyway.
 *
 * Wide screens get two columns: the TikTok card, which is tall once videos
 * load, beside the three short cards. Narrow ones stack in the same order.
 */
export function Profile() {
  const { user } = useAuth();
  const profileQuery = useProfile();
  const { data: profile, isLoading } = profileQuery;
  const applicationQuery = useApplication();
  const { data: application } = applicationQuery;
  const queryClient = useQueryClient();

  /*
   * null means "not touched", so the field shows whatever the profile says. A
   * background refetch can therefore never overwrite what somebody is in the
   * middle of typing, and there is no effect copying server state into state.
   */
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const name = draft ?? profile?.display_name ?? '';

  const save = useMutation({
    mutationFn: async (next: string) => {
      const { error } = await getSupabase()
        .from('profiles')
        .update({ display_name: next || null })
        .eq('id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft(null);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2600);
      void queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = displayNameSchema.safeParse(name);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }
    setFieldError(undefined);
    save.mutate(parsed.data);
  };

  if (isLoading) {
    return (
      <div className="grid items-start gap-6 lg:grid-cols-2" aria-busy="true">
        <div className="wx-skeleton h-72 rounded-xl lg:row-span-3" />
        <div className="wx-skeleton h-44 rounded-xl" />
        <div className="wx-skeleton h-44 rounded-xl" />
        <div className="wx-skeleton h-44 rounded-xl" />
      </div>
    );
  }

  if (profileQuery.isError || !profile) {
    return (
      <DataError
        title="We could not load your profile"
        body="Something went wrong on our side, not yours. Nothing you saved is lost."
        onRetry={() => profileQuery.refetch()}
      />
    );
  }

  const unchanged = name.trim() === (profile.display_name ?? '');

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      {/* THEIR OWN TIKTOK, first. It is the one thing here a creator has a
          reason to come back to. On wide screens it takes the whole left column. */}
      <div className="min-w-0 lg:row-span-3">
        <TikTokConnection />
      </div>

      {/* ----------------------------------------------------------- name -- */}
      <Card title="Display name" note="What the Wurx team and your brand hubs call you.">
        <form onSubmit={onSubmit} noValidate>
          <Field
            label="Your name"
            error={fieldError ?? (save.error ? (save.error as Error).message : undefined)}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="displayName"
                autoComplete="name"
                maxLength={60}
                placeholder="Your name"
                value={name}
                disabled={save.isPending}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setFieldError(undefined);
                }}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </Field>

          <div className="mt-4 flex items-center gap-3">
            <Button type="submit" disabled={save.isPending || unchanged}>
              {save.isPending ? 'Saving...' : 'Save'}
            </Button>
            {saved ? (
              <span
                role="status"
                className="text-success inline-flex items-center gap-1.5 text-[0.8125rem]"
              >
                <Check size={15} aria-hidden />
                Saved
              </span>
            ) : null}
          </div>
        </form>
      </Card>

      {/* -------------------------------------------------------- account -- */}
      <Card title="Account">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Row label="Email" value={profile.email} breakAll />
          <Row label="Status" value={ROLE_LABEL[profile.role]} />
          <Row
            label="Tier"
            value={profile.tier ? TIER_LABEL[profile.tier] : 'Not assigned yet'}
          />
          <Row label="Joined" value={longDate(profile.created_at)} />
        </dl>
      </Card>

      {/* --------------------------------------------------- application -- */}
      {applicationQuery.isError ? (
        <DataError
          title="We could not load your application"
          onRetry={() => applicationQuery.refetch()}
        />
      ) : application ? (
        <Card
          title="Your application"
          note="Something wrong here? Tell the team and they will correct it. It cannot be edited once an application has been reviewed."
        >
          <dl className="grid gap-3 sm:grid-cols-2">
            <Row label="TikTok handle" value={`@${application.tiktok_handle}`} breakAll />
            <Row
              label="Niche"
              value={
                application.niche === 'Other'
                  ? (application.niche_other ?? 'Other')
                  : application.niche
              }
            />
            <Row
              label="Worked with the team before"
              value={application.worked_with_wurx ? 'Yes' : 'No'}
            />
            <Row label="Applied" value={longDate(application.created_at)} />
          </dl>
        </Card>
      ) : applicationQuery.isLoading ? (
        <div className="wx-skeleton h-44 rounded-xl" />
      ) : null}
    </div>
  );
}

function Card({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="wx-neo-raised min-w-0 rounded-xl p-5 sm:p-6">
      <h2 className="text-lg font-bold">{title}</h2>
      {note ? (
        <p className="text-muted mt-1.5 text-[0.875rem] leading-relaxed">{note}</p>
      ) : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Row({ label, value, breakAll }: { label: string; value: string; breakAll?: boolean }) {
  return (
    <div className="wx-neo-inset min-w-0 rounded-lg px-4 py-3">
      <dt className="text-faint font-mono text-[0.6875rem] tracking-[0.12em] uppercase">
        {label}
      </dt>
      <dd className={`mt-1 text-[0.9375rem] font-medium ${breakAll ? 'break-all' : ''}`}>
        {value}
      </dd>
    </div>
  );
}
