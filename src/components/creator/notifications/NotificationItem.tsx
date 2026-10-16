import { Link } from 'react-router';
import {
  BellRing,
  CircleCheck,
  Clapperboard,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  whenLabel,
  type CreatorNotification,
  type NotificationKind,
} from '@/lib/creator/useCreatorNotifications';

/**
 * ONE EVENT, AND THE SCREEN IT HAPPENED ON.
 *
 * A row, not a card: `wx-neo-raised-sm` is the same glass material as the panel
 * around it with the `backdrop-filter` left off, so a panel of twenty of these
 * still costs exactly one blurred layer. See the header of `NotificationBell`
 * for the whole layer count.
 *
 * It is a `Link` rather than a div with an onClick, because it genuinely goes
 * somewhere: middle-click, long-press and "open in new tab" all work, and a
 * screen reader announces it as a link to Offers rather than as a mystery
 * button. Opening it is also what marks it read.
 */

const ICON: Record<NotificationKind, LucideIcon> = {
  stage: BellRing,
  request: CircleCheck,
  content: Clapperboard,
  reward: Trophy,
};

export function NotificationItem({
  item,
  onOpen,
}: {
  item: CreatorNotification;
  onOpen: (id: string) => void;
}) {
  const Icon = ICON[item.kind];

  return (
    <Link
      to={item.to}
      onClick={() => onOpen(item.id)}
      className={cn(
        'wx-neo-raised-sm ease-brand group flex w-full items-start gap-2.5 rounded-xl',
        /*
         * `shrink-0` IS LOad-BEARING. The panel is a `flex-col` with a capped
         * height and a scrolling list, and a flex child defaults to
         * `flex-shrink: 1` — so as soon as the notifications were taller than
         * the panel, every row was squeezed below its own content height and
         * the two-line body spilled over the row beneath it. That is the
         * overlapping Rashid reported. It only appears with enough items,
         * which is why five rows in an isolated preview looked perfect.
         */
        'shrink-0',
        /* 2.75rem is the tap floor, and a row with two lines of text clears it
           comfortably; the minimum is here for the one-line case rather than as
           decoration. */
        'min-h-11 p-2.5 text-left transition-colors duration-150',
        'hover:text-accent focus-visible:outline-accent focus-visible:outline-2',
        'focus-visible:outline-offset-2'
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-0.5 grid size-7 shrink-0 place-items-center rounded-full',
          item.unread ? 'bg-accent-soft text-accent' : 'text-muted bg-surface-2'
        )}
      >
        <Icon size={14} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-[0.8125rem] leading-[1.3]',
              item.unread ? 'font-semibold' : 'font-medium'
            )}
          >
            {item.title}
          </span>
          <span className="text-faint shrink-0 text-[0.6875rem] tabular-nums">
            {whenLabel(item.at)}
          </span>
        </span>

        {/* Two lines, then it stops. The whole sentence is on the screen the
            link goes to, and a panel of paragraphs is a panel nobody reads. */}
        <span className="text-muted mt-0.5 line-clamp-2 block text-[0.75rem] leading-[1.4]">
          {item.body}
        </span>
      </span>

      {item.unread ? (
        <span
          aria-hidden
          className="bg-accent mt-2 size-1.5 shrink-0 rounded-full"
          title="Unread"
        />
      ) : null}
    </Link>
  );
}
