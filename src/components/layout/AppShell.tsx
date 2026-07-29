import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { LogOut } from 'lucide-react';
import { WurxMark } from '@/components/brand/WurxMark';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/layout/Section';
import { useAuth, type AppRole, type CreatorTier } from '@/lib/auth/auth-context';
import { useProfile } from '@/lib/auth/useProfile';

const ROLE_LABEL: Record<AppRole, string> = {
  applicant: 'Applicant',
  creator: 'Creator',
  creative_strategist: 'Creative strategist',
  ops: 'Ops',
  admin: 'Admin',
};

const TIER_LABEL: Record<CreatorTier, string> = {
  creator: 'Creator',
  rising: 'Rising',
  pro: 'Pro',
  elite: 'Elite',
};

/** Frame for every signed-in screen. */
export function AppShell({ children }: { children: ReactNode }) {
  const { claims, signOut } = useAuth();
  const { data: profile } = useProfile();
  const [signingOut, setSigningOut] = useState(false);

  // The profile row wins over the JWT claim wherever both exist. Claims are
  // only refreshed with the token, roughly hourly, so a creator approved a
  // minute ago would otherwise still be badged "Applicant" up here while their
  // dashboard already says otherwise.
  const role: AppRole | undefined = profile?.role ?? claims?.role;
  const tier: CreatorTier | null = profile ? profile.tier : (claims?.tier ?? null);

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line bg-surface-1">
        <Container>
          <div className="flex h-16 items-center justify-between gap-4">
            <Link to="/" aria-label="WurxMediaHub home">
              <WurxMark />
            </Link>

            <div className="flex items-center gap-2.5">
              {role ? (
                <span className="hidden items-center gap-2 rounded-full border border-line px-3 py-1.5 font-mono text-[11px] tracking-[0.14em] text-muted uppercase sm:inline-flex">
                  {ROLE_LABEL[role]}
                  {tier ? (
                    <>
                      <span aria-hidden className="text-accent">
                        &middot;
                      </span>
                      <span className="text-accent">{TIER_LABEL[tier]}</span>
                    </>
                  ) : null}
                </span>
              ) : null}

              <ThemeToggle />

              <Button
                variant="secondary"
                size="sm"
                disabled={signingOut}
                onClick={() => {
                  setSigningOut(true);
                  void signOut();
                }}
              >
                <LogOut size={15} aria-hidden />
                <span className="hidden sm:inline">
                  {signingOut ? 'Signing out...' : 'Sign out'}
                </span>
              </Button>
            </div>
          </div>
        </Container>
      </header>

      <main>
        <Container className="py-10 sm:py-14">
          {profile ? (
            <p className="font-mono text-[11px] tracking-[0.16em] text-faint uppercase">
              Signed in as {profile.display_name || profile.email}
            </p>
          ) : (
            <div className="h-4 w-48 animate-pulse rounded bg-surface-2" />
          )}
          {children}
        </Container>
      </main>
    </div>
  );
}
