import { useState } from 'react';
import { m } from 'motion/react';
import {
  BadgeCheck,
  Eye,
  Heart,
  Link2,
  Loader2,
  MessageCircle,
  RefreshCw,
  Share2,
  Unlink,
  Video,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import {
  useTikTokAccount,
  useTikTokAction,
  useTikTokVideos,
  type TikTokAccount,
  type TikTokVideo,
} from '@/lib/creator/useTikTokAccount';

/**
 * A creator connects their own TikTok account, and sees what their videos did.
 *
 * WHY THIS IS CREATOR-FACING when the ads connection is emphatically not. The
 * standing rule that creators never see the TikTok connection is about the
 * BRAND's ad account and its spend. This is the opposite: their account, their
 * choice, their numbers, and they can unlink it in one click.
 *
 * THE FIGURES HERE ARE NOT THE FIGURES ON "MY NUMBERS", and the card says so in
 * as many words. These are ORGANIC lifetime totals for the whole video, from
 * TikTok's Display API. My numbers shows the ad-driven slice bought through GMV
 * Max. They measure different things and will never reconcile, so a creator who
 * spots the difference has to find the explanation here rather than conclude one
 * of them is lying.
 */
export function TikTokConnection() {
  const { data: account, isLoading } = useTikTokAccount();
  const connected = Boolean(account);
  const { data: videos, isLoading: videosLoading } = useTikTokVideos(connected);
  const act = useTikTokAction();
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  const busy = act.isPending;

  const start = async () => {
    const r = await act.mutateAsync('connect.start');
    // The Edge Function builds the URL, because it holds the client key.
    if (r.url) window.location.href = r.url;
  };

  if (isLoading) {
    return <div className="wx-skeleton h-40 rounded-xl" />;
  }

  return (
    <section className="border-line bg-surface-1 rounded-xl border p-5 shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        {/* min-w-0 flex-1, and no max-width. With a fixed `max-w-lg` the
            paragraph was nearly as wide as the card, so the Connected pill
            wrapped onto a line of its own and read as stranded rather than as
            a status on the heading. */}
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Your TikTok account</h2>
          <p className="text-muted mt-1 text-[0.875rem] leading-relaxed">
            {/*
              TWO SENTENCES, BECAUSE ONE OF THEM IS WRONG HALF THE TIME. This
              read "Connect it to see how your own videos performed" whatever
              the state, so somebody who HAD connected was still being asked to.
              It also predates the profile permission and named only the video
              figures, which is the same drift the consent list below fell into.
            */}
            {connected
              ? 'Your own video numbers, in here with the rest of your work.'
              : 'Connect it to see how your own videos performed: the views, likes, comments and shares on everything you post.'}
          </p>
        </div>

        {connected ? (
          <span className="bg-success-soft text-success shrink-0 rounded-full px-3 py-1 text-[0.75rem] font-semibold">
            Connected
          </span>
        ) : null}
      </div>

      {!connected ? (
        <div className="mt-5">
          <Button onClick={start} disabled={busy}>
            {busy ? (
              <Loader2 size={16} aria-hidden className="animate-spin" />
            ) : (
              <Link2 size={16} aria-hidden />
            )}
            {busy ? 'Opening TikTok...' : 'Connect TikTok'}
          </Button>
          {/*
            SAY WHAT IT CAN AND CANNOT DO, before they click rather than after.
            Somebody about to hand a third party access to their account
            deserves the answer at the moment they are deciding.

            SO THIS LIST IS A PROMISE, AND IT MUST MATCH `DISPLAY_SCOPES`
            EXACTLY. When the profile and stats scopes were added it still read
            "we only ever read your own public videos", which had quietly become
            untrue. A scope added without a line added here means the product is
            lying to somebody at the precise moment they are deciding whether to
            trust it.
          */}
          <ul className="text-muted mt-4 grid gap-1.5 text-[0.8125rem]">
            <li>We read your name and profile picture, so we can show you who is connected.</li>
            <li>
              We read your own videos and their view, like, comment and share counts.
            </li>
            <li>
              <strong className="text-text font-semibold">
                We can never post, edit or delete anything.
              </strong>{' '}
              The permissions we ask for cannot do those things.
            </li>
            <li>You can disconnect at any time, from right here.</li>
          </ul>
          {act.error ? (
            <p role="alert" className="text-danger mt-3 text-[0.8125rem]">
              {(act.error as Error).message}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <div className="border-line mt-4 border-t pt-4">
            <div className="flex flex-wrap items-start gap-3">
              {account?.avatar_url ? (
                <img
                  src={account.avatar_url}
                  alt=""
                  className="size-10 shrink-0 rounded-full object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="bg-surface-2 grid size-10 shrink-0 place-items-center rounded-full">
                  <Video size={15} aria-hidden className="text-faint" />
                </span>
              )}

              {/* basis-40 so the buttons drop to a row of their own at ~375px
                  rather than squeezing the name down to two characters. */}
              <span className="min-w-0 flex-1 basis-40">
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-semibold">
                    {account?.display_name ?? 'Your TikTok'}
                  </span>
                  {account?.is_verified ? (
                    <>
                      <BadgeCheck size={15} aria-hidden className="text-accent shrink-0" />
                      {/* The badge is a picture. Somebody on a screen reader
                          gets the same fact in words. */}
                      <span className="sr-only">Verified on TikTok</span>
                    </>
                  ) : null}
                </span>

                {account?.username ? <Handle account={account} /> : null}

                <span className="text-muted mt-0.5 block text-[0.75rem]">
                  {account?.last_synced_at
                    ? `Updated ${new Date(account.last_synced_at).toLocaleString()}`
                    : 'Not pulled in yet'}
                </span>
              </span>

              <span className="flex shrink-0 flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => act.mutate('videos.refresh')}
                  disabled={busy}
                >
                  <RefreshCw size={14} aria-hidden className={cn(busy && 'animate-spin')} />
                  Refresh
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingDisconnect(true)}
                  disabled={busy}
                >
                  <Unlink size={14} aria-hidden />
                  Disconnect
                </Button>
              </span>
            </div>

            {account ? <AccountStats account={account} /> : null}
          </div>

          {act.error ? (
            <p role="alert" className="text-danger mt-3 text-[0.8125rem]">
              {(act.error as Error).message}
            </p>
          ) : null}

          {confirmingDisconnect ? (
            <div className="border-danger/40 bg-danger-soft mt-4 rounded-xl border p-4">
              <p className="text-danger text-[0.8125rem] leading-relaxed font-medium">
                Disconnect your TikTok account? We will forget the link and delete the figures we
                pulled in. Nothing on TikTok itself changes, and you can reconnect whenever you
                like.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    act.mutate('disconnect', { onSuccess: () => setConfirmingDisconnect(false) })
                  }
                >
                  {busy ? 'Disconnecting...' : 'Yes, disconnect'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setConfirmingDisconnect(false)}
                >
                  Keep it connected
                </Button>
              </div>
            </div>
          ) : null}

          {/* --------------------------------------------------- the videos -- */}
          <div className="mt-5">
            {videosLoading ? (
              <ul className="grid gap-3">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="wx-skeleton h-20 rounded-xl" />
                ))}
              </ul>
            ) : !videos || videos.length === 0 ? (
              <div className="border-line rounded-xl border border-dashed px-5 py-8 text-center">
                <Video size={20} aria-hidden className="text-faint mx-auto" />
                <p className="mt-3 text-[0.875rem] font-semibold">No videos pulled in yet</p>
                <p className="text-muted mx-auto mt-1.5 max-w-xs text-[0.8125rem] leading-relaxed">
                  Press Refresh to fetch your most recent posts from TikTok.
                </p>
              </div>
            ) : (
              <>
                <ul className="grid gap-3">
                  {videos.map((v, i) => (
                    <m.li
                      key={v.video_id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.28, ease: 'easeOut', delay: Math.min(i, 6) * 0.04 }}
                    >
                      <VideoRow video={v} />
                    </m.li>
                  ))}
                </ul>
                {/*
                  THE SENTENCE THAT STOPS A SUPPORT CALL. These totals are the
                  whole video, organically. My numbers counts the sales the ads
                  behind a video produced. Both are true and they will never
                  match, so the difference is explained where somebody would
                  notice it rather than in a help page.
                */}
                <p className="text-faint mt-4 text-[0.75rem] leading-relaxed">
                  These are TikTok&rsquo;s own totals for each video, all of its views and likes
                  since you posted it. They are a different measure from the sales figures on
                  My numbers, which count only what the ads behind a video brought in, so the
                  two will not add up against each other.
                </p>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Was this scope actually granted?
 *
 * READ FROM THE CONNECTION, NEVER FROM `DISPLAY_SCOPES`. What we ask for and
 * what we hold are different things: a creator can decline a single permission
 * on TikTok's consent screen, and every connection made before 2026-08-26 was
 * granted only `user.info.basic,video.list`. A token permanently carries the
 * scopes it was minted with, so this row is the only honest answer.
 */
function granted(scope: string | undefined, want: string): boolean {
  return (scope ?? '')
    .split(',')
    .map((s) => s.trim())
    .includes(want);
}

/**
 * Their @handle, linking to their TikTok profile.
 *
 * THE HREF IS THIRD-PARTY DATA GOING INTO THE DOM, so the scheme is checked
 * rather than assumed. React escapes text but will happily render
 * `href="javascript:..."`, and `profile_deep_link` arrives from an API response
 * — the one string in this component that somebody else chooses. If it is not
 * plain https the handle still shows, just not as a link.
 */
function Handle({ account }: { account: TikTokAccount }) {
  const href = account.profile_deep_link;
  const safe = href && /^https:\/\//i.test(href) ? href : null;
  const handle = `@${account.username}`;

  if (!safe) {
    return <span className="text-muted block truncate text-[0.8125rem]">{handle}</span>;
  }
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className="text-muted hover:text-accent block truncate text-[0.8125rem] transition-colors"
    >
      {handle}
      <span className="sr-only"> — open this profile on TikTok in a new tab</span>
    </a>
  );
}

/**
 * The account totals: followers, lifetime likes, how many videos they have.
 *
 * HIDDEN ENTIRELY when the stats permission was not granted, rather than shown
 * as three dashes. Those are different statements — "TikTok did not tell us
 * this number" and "you never gave us permission to ask" — and a row of dashes
 * says the first while meaning the second, which reads as a product that is
 * broken rather than one respecting a choice somebody made.
 *
 * A dash INSIDE the row still means the first thing, and that is correct: the
 * permission is there, the number is not.
 *
 * NOT the same numbers as the video list below. These are the whole account,
 * for its lifetime; those are one video each.
 */
function AccountStats({ account }: { account: TikTokAccount }) {
  if (!granted(account.scope, 'user.info.stats')) return null;

  return (
    <dl className="border-line mt-4 grid grid-cols-3 gap-2 border-t pt-4">
      <Stat label="Followers" value={account.follower_count} />
      <Stat label="Likes" value={account.likes_count} />
      <Stat label="Videos" value={account.video_count} />
    </dl>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-faint font-mono text-[0.625rem] tracking-[0.12em] uppercase">
        {label}
      </dt>
      <dd className="font-display wx-lining mt-0.5 text-[1.0625rem] font-semibold">
        {/* A dash, not a zero. Being told you have no followers when nobody
            asked is worse than being told we do not know. */}
        {value === null ? <span className="text-faint">&ndash;</span> : compact(value)}
      </dd>
    </div>
  );
}

/** One video, with the four figures a creator came for. */
function VideoRow({ video }: { video: TikTokVideo }) {
  return (
    <div className="border-line bg-surface-2/40 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border p-3">
      <span className="bg-surface-2 grid h-14 w-10 shrink-0 place-items-center overflow-hidden rounded-md">
        {video.cover_image_url ? (
          <img src={video.cover_image_url} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <Video size={14} aria-hidden className="text-faint" />
        )}
      </span>

      <span className="min-w-0 flex-1 basis-40">
        <span className="block truncate text-[0.875rem] font-medium">
          {video.title?.trim() || 'Untitled video'}
        </span>
        {video.posted_at ? (
          <span className="text-faint block text-[0.75rem]">
            {new Date(video.posted_at).toLocaleDateString()}
          </span>
        ) : null}
      </span>

      <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Figure icon={<Eye size={13} aria-hidden />} label="views" value={video.view_count} />
        <Figure icon={<Heart size={13} aria-hidden />} label="likes" value={video.like_count} />
        <Figure
          icon={<MessageCircle size={13} aria-hidden />}
          label="comments"
          value={video.comment_count}
        />
        <Figure icon={<Share2 size={13} aria-hidden />} label="shares" value={video.share_count} />
      </span>
    </div>
  );
}

function Figure({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
}) {
  return (
    <span className="flex items-center gap-1.5" title={label}>
      <span className="text-faint">{icon}</span>
      {/*
        A DASH, NOT A ZERO, when TikTok did not tell us. A zero is a number a
        creator would believe about their own video, and believing a wrong zero
        is worse than seeing that we do not know.
      */}
      <span className="font-display text-[0.9375rem] font-semibold">
        {value === null ? <span className="text-faint">&ndash;</span> : compact(value)}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * 12400 becomes 12.4k, the way TikTok itself writes it.
 *
 * THE ROUNDING BOUNDARY IS THE BUG HERE, and it was a real one: 999,600 is
 * under a million, so it took the "k" branch, and `(999.6).toFixed(0)` is
 * "1000" — printing "1000k" for a video with nearly a million views. The
 * threshold has to be where the ROUNDED value crosses, not where the raw one
 * does.
 */
function compact(n: number): string {
  if (n < 1000) return String(n);
  // 999,500 and up would round to "1000k", so they belong in millions.
  if (n < 999_500) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}
