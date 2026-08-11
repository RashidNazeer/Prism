import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';
import { useApplication } from '@/lib/auth/useApplication';
import { ROLE_LABEL, TIER_LABEL } from '@/lib/tiers';

// Moved to src/lib/tiers.ts on 2026-08-11, because the admin creator screens
// print the same words and two copies of a label is how they drift.

/**
 * The creator's own account.
 *
 * The dashboard used to carry this as a card, which meant the screen that
 * should be about where they stand with us was half filled with an email
 * address they already know. It lives here instead.
 *
 * Display name is the ONLY thing editable, and that is a database decision
 * rather than a UI one: `display_name` is the single column granted to
 * `authenticated` on this table. Role, tier and email are not editable by the
 * person they belong to, and the escalation guard would refuse anyway.
 */
export function Profile() {
  const { user } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const { data: application } = useApplication();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);

  // Seed the field once the profile arrives, without clobbering anything they
  // have typed since.
  useEffect(() => {
    if (profile) setName(profile.display_name ?? '');
  }, [profile]);

  const save = useMutation({
    mutationFn: async (next: string) => {
      const trimmed = next.trim();
      if (trimmed.length > 60) throw new Error('Keep your name under 60 characters');
      const { error } = await getSupabase()
        .from('profiles')
        .update({ display_name: trimmed || null })
        .eq('id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2600);
      void queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(name);
  };

  return (
    <AppShell>
      <h1 className="font-display text-[clamp(26px,4.4vw,40px)] leading-[1.05] font-semibold tracking-[-0.02em]">
        My profile
      </h1>
      <p className="text-muted mt-2 max-w-2xl text-[15px] leading-relaxed">
        Your account details. Only your name is yours to change; the rest is set by the Wurx
        team.
      </p>

      {isLoading ? (
        <div className="mt-8 max-w-xl space-y-4">
          <div className="wx-skeleton h-32 rounded-[20px]" />
          <div className="wx-skeleton h-40 rounded-[20px]" />
        </div>
      ) : (
        <div className="mt-8 grid max-w-xl gap-6">
          {/* ------------------------------------------------------- name -- */}
          <section className="border-line bg-surface-1 rounded-[20px] border p-6 shadow-md">
            <h2 className="text-lg font-bold">Your name</h2>
            <p className="text-muted mt-1.5 text-[14px] leading-relaxed">
              What the Wurx team and your brand hubs call you.
            </p>

            <form onSubmit={onSubmit} noValidate className="mt-5">
              <Field
                label="Display name"
                error={save.error ? (save.error as Error).message : undefined}
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    name="displayName"
                    autoComplete="name"
                    maxLength={60}
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    aria-describedby={describedBy}
                    invalid={invalid}
                  />
                )}
              </Field>

              <div className="mt-4 flex items-center gap-3">
                <Button
                  type="submit"
                  disabled={save.isPending || name.trim() === (profile?.display_name ?? '')}
                >
                  {save.isPending ? 'Saving...' : 'Save'}
                </Button>
                {saved ? (
                  <span
                    role="status"
                    className="text-success inline-flex items-center gap-1.5 text-[13px]"
                  >
                    <Check size={15} aria-hidden />
                    Saved
                  </span>
                ) : null}
              </div>
            </form>
          </section>

          {/* ---------------------------------------------------- account -- */}
          <section className="border-line bg-surface-1 rounded-[20px] border p-6 shadow-md">
            <h2 className="text-lg font-bold">Account</h2>
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <Row label="Email" value={profile?.email ?? ''} breakAll />
              <Row label="Status" value={profile ? ROLE_LABEL[profile.role] : ''} />
              <Row
                label="Tier"
                value={profile?.tier ? TIER_LABEL[profile.tier] : 'Not assigned yet'}
              />
              <Row
                label="Joined"
                value={
                  profile
                    ? new Date(profile.created_at).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })
                    : ''
                }
              />
            </dl>
          </section>

          {/* ------------------------------------------------ application -- */}
          {application ? (
            <section className="border-line bg-surface-1 rounded-[20px] border p-6 shadow-md">
              <h2 className="text-lg font-bold">Your application</h2>
              <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
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
                  label="Worked with Wurx before"
                  value={application.worked_with_wurx ? 'Yes' : 'No'}
                />
                <Row
                  label="Applied"
                  value={new Date(application.created_at).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                />
              </dl>
              <p className="border-line text-faint mt-5 border-t pt-4 text-[13px] leading-relaxed">
                Something wrong here? Tell the Wurx team and they will correct it. It cannot be
                edited once an application has been reviewed.
              </p>
            </section>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}

function Row({ label, value, breakAll }: { label: string; value: string; breakAll?: boolean }) {
  return (
    <div>
      <dt className="text-faint">{label}</dt>
      <dd className={`mt-0.5 font-medium ${breakAll ? 'break-all' : ''}`}>{value}</dd>
    </div>
  );
}
