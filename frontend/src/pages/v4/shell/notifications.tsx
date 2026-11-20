import { type MouseEvent, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { List, ListRow } from "@infisical/cipher/ui/list";
import { PopoverContent } from "@infisical/cipher/ui/popover";
import { formatDistanceToNow } from "date-fns";

import { isCriticalNotification, type TUserNotification } from "@app/hooks/api/notifications/types";

import { failed } from "../access/toast";
import { ShowMoreFooter } from "../components/show-more-footer";
import { useV4Adapter } from "../data/adapters";
import { useGo } from "../links";

import styles from "./shell.module.css";

const PAGE_SIZE = 20;

const inline = { p: "span" } as const;

const plainText = (markdown: string) => markdown.replace(/[*_`~[\]]/g, "");

const toHref = (link?: string | null) => {
  if (!link) return undefined;
  try {
    const { pathname, search, hash } = new URL(link, window.location.origin);
    return `${pathname}${search}${hash}`;
  } catch {
    return undefined;
  }
};

export const useNotificationInbox = (orgId: string) => {
  const shell = useV4Adapter("shell");
  const { data: notifications = [], isPending } = shell.useNotifications(orgId);
  const [open, setOpen] = useState(false);
  const closedAt = useRef(0);
  return {
    open,
    unread: notifications.filter((notification) => !notification.isRead).length,
    notifications,
    isPending,
    onOpenChange: (next: boolean) => {
      if (!next) closedAt.current = Date.now();
      setOpen(next);
    },
    toggle: () => {
      if (Date.now() - closedAt.current < 250) return;
      setOpen(true);
    }
  };
};

const InboxPanel = ({
  orgId,
  notifications,
  isPending,
  onClose
}: {
  orgId: string;
  notifications: TUserNotification[];
  isPending: boolean;
  onClose: () => void;
}) => {
  const shell = useV4Adapter("shell");
  const go = useGo();
  const markAll = shell.useMarkAllNotificationsRead();
  const markRead = shell.useMarkNotificationRead();
  const remove = shell.useDeleteNotification();
  const clearAll = shell.useDeleteAllNotifications();
  const [shownCount, setShownCount] = useState(PAGE_SIZE);
  const [confirmClear, setConfirmClear] = useState(false);
  const unread = notifications.filter((notification) => !notification.isRead).length;
  const critical = notifications.filter(
    (notification) => !notification.isRead && isCriticalNotification(notification.type)
  ).length;

  const read = (notification: TUserNotification) => {
    if (notification.isRead) return;
    markRead
      .mutateAsync({ orgId, notificationId: notification.id })
      .catch((error) => failed("Failed to mark notification as read", error));
  };
  const openNotification = (event: MouseEvent, notification: TUserNotification, href?: string) => {
    read(notification);
    if (
      !href ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    onClose();
    go(href);
  };
  const headerAction = unread ? (
    <Button
      variant="ghost"
      size="sm"
      loading={markAll.isPending}
      onClick={() =>
        markAll
          .mutateAsync({ orgId })
          .catch((error) => failed("Failed to mark notifications as read", error))
      }
    >
      Mark all as read
    </Button>
  ) : (
    <Button
      variant="ghost"
      size="sm"
      disabled={!notifications.length}
      onClick={() => setConfirmClear(true)}
    >
      Clear all
    </Button>
  );

  return (
    <PopoverContent
      align="end"
      side="bottom"
      className={styles.inbox}
      onAuxClick={(event) => {
        if (event.button !== 1) return;
        const id = (event.target as HTMLElement)
          .closest("[data-list-row]")
          ?.getAttribute("data-list-row");
        const notification = notifications.find((entry) => entry.id === id);
        if (notification) read(notification);
      }}
      onInteractOutside={(event) => {
        if (confirmClear) event.preventDefault();
      }}
    >
      <List
        label="Notifications"
        variant="bare"
        title="Notifications"
        count={
          critical ? (
            <Badge tone="bad">{`${critical > 99 ? "99+" : critical} critical`}</Badge>
          ) : undefined
        }
        action={headerAction}
        loading={isPending}
        empty={<EmptyState size="sm" icon="bell" title="No notifications" />}
        footer={
          notifications.length > shownCount && (
            <div className={styles.inboxMore}>
              <ShowMoreFooter
                status={`Showing ${shownCount.toLocaleString()} of ${notifications.length.toLocaleString()}`}
                onShowMore={() => setShownCount(shownCount + PAGE_SIZE)}
              />
            </div>
          )
        }
      >
        {notifications.slice(0, shownCount).map((notification) => {
          const href = toHref(notification.link);
          return (
            <ListRow
              key={notification.id}
              value={notification.id}
              label={plainText(notification.title)}
              title={<ReactMarkdown components={inline}>{notification.title}</ReactMarkdown>}
              description={
                notification.body && (
                  <ReactMarkdown components={inline}>{notification.body}</ReactMarkdown>
                )
              }
              meta={`${formatDistanceToNow(new Date(notification.createdAt))} ago`}
              badge={
                isCriticalNotification(notification.type) &&
                !notification.isRead && <Badge tone="bad">Critical</Badge>
              }
              unread={!notification.isRead}
              href={href}
              onClick={(event) => openNotification(event, notification, href)}
              actions={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  icon="trash"
                  iconOnly
                  onClick={() =>
                    remove
                      .mutateAsync({ orgId, notificationId: notification.id })
                      .catch((error) => failed("Failed to delete notification", error))
                  }
                >
                  Delete notification
                </Button>
              }
            />
          );
        })}
      </List>
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent tone="danger" pending={clearAll.isPending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all notifications?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes all your read notifications for this organization, including account
              notifications. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              loading={clearAll.isPending}
              onClick={async (event) => {
                event.preventDefault();
                try {
                  await clearAll.mutateAsync({ orgId });
                  setConfirmClear(false);
                } catch (error) {
                  failed("Failed to clear notifications", error);
                }
              }}
            >
              Clear all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PopoverContent>
  );
};

export const NotificationInbox = ({
  orgId,
  inbox
}: {
  orgId: string;
  inbox: ReturnType<typeof useNotificationInbox>;
}) =>
  inbox.open && (
    <InboxPanel
      orgId={orgId}
      notifications={inbox.notifications}
      isPending={inbox.isPending}
      onClose={() => inbox.onOpenChange(false)}
    />
  );
