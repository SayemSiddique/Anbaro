'use client';

/**
 * Notifications as a topbar badge and panel rather than a sidebar destination.
 *
 * A destination costs a permanent slot in the navigation for something that is
 * empty most of the day. A badge costs nothing when there is nothing to say,
 * and it is visible from every screen instead of only from the one you
 * navigated to.
 */

import type { Notification } from '@anbaro/contracts';
import { Bell } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { InlineError, SkeletonList } from './feedback';
import { Sheet } from './overlay';
import { QuietButton } from './ui';

function whenever(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function NotificationBell({
  href,
  load,
  markRead,
  onNavigate,
}: {
  /** The full page, for anything the panel does not show. */
  href: string;
  load?: (() => Promise<Notification[]>) | undefined;
  markRead?: ((id: string) => Promise<unknown>) | undefined;
  onNavigate?: ((href: string) => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [error, setError] = useState('');
  const unread = notifications?.filter((notification) => !notification.readAt).length ?? 0;

  const refresh = useCallback(async () => {
    // With no loader wired, settle on "nothing" rather than leaving the panel
    // in a skeleton it can never come out of.
    if (!load) {
      setNotifications([]);
      return;
    }
    setError('');
    try {
      setNotifications(await load());
    } catch {
      setError('Could not load notifications.');
    }
  }, [load]);

  // The badge has to be right before the panel is ever opened, so the count is
  // fetched on mount rather than on open.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function open_(notification: Notification) {
    setOpen(false);
    if (markRead && !notification.readAt) {
      setNotifications(
        (current) =>
          current?.map((candidate) =>
            candidate.id === notification.id
              ? { ...candidate, readAt: new Date().toISOString() }
              : candidate,
          ) ?? null,
      );
      // Optimistic: the row is already marked. A failure re-reads the truth
      // rather than leaving the badge lying.
      await markRead(notification.id).catch(() => void refresh());
    }
    onNavigate?.(href);
  }

  return (
    <>
      <button
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="notif-bell"
        onClick={() => {
          setOpen(true);
          // The shell outlives every route change, so the count fetched on
          // mount can be minutes stale by the time the panel is opened.
          void refresh();
        }}
        type="button"
      >
        <Bell size={18} strokeWidth={2} />
        {unread > 0 ? (
          <span aria-hidden="true" className="notif-badge">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>
      <Sheet
        description="Low stock and count activity across your workspace."
        footer={
          <QuietButton
            onClick={() => {
              setOpen(false);
              onNavigate?.(href);
            }}
          >
            See all notifications
          </QuietButton>
        }
        onClose={() => setOpen(false)}
        open={open}
        side="right"
        title="Notifications"
      >
        {error ? (
          <InlineError detail={error} onRetry={() => void refresh()} />
        ) : notifications === null ? (
          <SkeletonList rows={4} />
        ) : notifications.length === 0 ? (
          <p className="notif-empty">Nothing needs you right now.</p>
        ) : (
          <ul className="notif-list">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <button
                  className={`notif-item${notification.readAt ? '' : ' is-unread'}`}
                  onClick={() => void open_(notification)}
                  type="button"
                >
                  <span className="notif-item-title">{notification.title}</span>
                  <span className="notif-item-body">{notification.body}</span>
                  <span className="notif-item-meta">
                    {notification.locationName} · {whenever(notification.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </>
  );
}
