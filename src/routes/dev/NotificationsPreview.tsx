import { NotificationItem } from '@/components/creator/notifications/NotificationItem';
import type { CreatorNotification } from '@/lib/creator/useCreatorNotifications';

/**
 * THE NOTIFICATION ROWS, AGAINST MADE-UP ITEMS. DEV ONLY.
 *
 * Added because the panel came back from its build with rows overlapping each
 * other and the surface showing the page through it, and neither fault could
 * be found by reading the markup — the bell only appears signed in, and nobody
 * on this machine has a creator login. Rendering the real row component with
 * fake rows is the only way to see it.
 *
 * The bodies below are deliberately LONG. The reported fault showed up exactly
 * where a body ran past one line, so a preview full of short tidy strings
 * would have reproduced nothing.
 */


const items: CreatorNotification[] = [
  {
    id: '1',
    kind: 'content',
    title: 'Video approved',
    body: 'Swisse · Swisse retainer, 8 videos, $360 at $45 a video. It counts towards this job.',
    to: '/app/content',
    at: Date.now() - 3600_000,
    unread: true,
  },
  {
    id: '2',
    kind: 'stage',
    title: 'Content pending',
    body: 'Swisse · Swisse retainer, 8 videos, $360 at $45 a video. Over to you. Film it and send it in.',
    to: '/app/offers',
    at: Date.now() - 2 * 86_400_000,
    unread: true,
  },
  {
    id: '3',
    kind: 'stage',
    title: 'Sample shipped',
    body: 'Dr Tobias · Dr Tobias retainer, 5 videos, $350 at $70 a video. It is on its way to you.',
    to: '/app/offers',
    at: Date.now() - 5 * 86_400_000,
    unread: false,
  },
  {
    id: '4',
    kind: 'request',
    title: 'Request approved',
    body: 'Swisse · You are on this one. The team is getting a sample out to you.',
    to: '/app/offers',
    at: Date.now() - 9 * 86_400_000,
    unread: false,
  },
  {
    id: '5',
    kind: 'reward',
    title: 'Short one',
    body: 'A one-line body, to check the single-line case still clears the tap floor.',
    to: '/app/contests',
    at: Date.now() - 20 * 86_400_000,
    unread: false,
  },
] as unknown as CreatorNotification[];

function Panel({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div data-theme={theme} className="bg-bg min-h-screen flex-1 p-6">
      <p className="text-faint mb-3 text-xs font-bold uppercase">{theme}</p>
      {/* The same box the bell opens: same material, same width, same cap. */}
      <div
        className="wx-glass-overlay flex max-h-[min(26rem,70dvh)] w-[min(21rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl"
        style={{ backgroundColor: 'var(--wx-surface-1)' }}
      >
        <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-1">
          <h2 className="text-text text-sm font-semibold">Notifications</h2>
          <button type="button" className="text-muted text-xs underline-offset-4 hover:underline">
            Mark all read
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2.5 pt-1 pb-2.5">
          {Array.from({ length: 14 }, (_, k) => items[k % items.length]!).map((n, k) => (
            <NotificationItem key={k} item={n} onOpen={() => {}} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function NotificationsPreview() {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Panel theme="light" />
      <Panel theme="dark" />
    </div>
  );
}
