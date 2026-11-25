import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from "react";
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
import { Count } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Media } from "@infisical/cipher/ui/item";
import { List, ListRow, ListSection } from "@infisical/cipher/ui/list";
import { PopoverContent } from "@infisical/cipher/ui/popover";
import { Sheet, SheetContent, SheetTitle } from "@infisical/cipher/ui/sheet";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { useAppShell } from "@infisical/cipher/ui/top-bar";

import type { TUserNotification } from "@app/hooks/api/notifications/types";

import { failed, toast } from "../access/toast";
import { ShowMoreFooter } from "../components/show-more-footer";
import { useV4Adapter } from "../data/adapters";
import { useGo } from "../links";
import {
  groupNotifications,
  isToday,
  type NotificationGroup,
  notificationIcon,
  shortTime
} from "./notification-groups";

import styles from "./notifications.module.css";

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

type Filter = "all" | "unread" | "critical";

const EMPTY_TITLES: Record<Filter, string> = {
  all: "No notifications",
  unread: "No unread notifications",
  critical: "No critical notifications"
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

const InboxBody = ({
  orgId,
  notifications,
  isPending,
  onClose,
  title
}: {
  orgId: string;
  notifications: TUserNotification[];
  isPending: boolean;
  onClose: () => void;
  title: ReactNode;
}) => {
  const shell = useV4Adapter("shell");
  const go = useGo();
  const markAll = shell.useMarkAllNotificationsRead();
  const markRead = shell.useMarkNotificationsRead();
  const remove = shell.useDeleteNotifications();
  const clearAll = shell.useDeleteAllNotifications();
  const [shownCount, setShownCount] = useState(PAGE_SIZE);
  const [filter, setFilter] = useState<Filter>("all");
  const [confirmClear, setConfirmClear] = useState(false);
  const [expanded, setExpanded] = useState<string>();

  const groups = groupNotifications(notifications);
  const unread = notifications.filter((notification) => !notification.isRead).length;
  const critical = groups.filter((group) => group.tone === "bad" && group.unread).length;
  const visible = groups.filter((group) => {
    if (filter === "unread") return group.unread > 0;
    if (filter === "critical") return group.tone === "bad";
    return true;
  });
  const shown = visible.slice(0, shownCount);
  const today = shown.filter((group) => isToday(group.latest.createdAt));
  const earlier = shown.filter((group) => !isToday(group.latest.createdAt));

  const readGroup = (group: NotificationGroup) => {
    const notificationIds = group.items
      .filter((notification) => !notification.isRead)
      .map((notification) => notification.id);
    if (!notificationIds.length) return;
    markRead
      .mutateAsync({ orgId, notificationIds })
      .catch((error) => failed("Failed to mark notifications as read", error));
  };

  const deleteGroup = (group: NotificationGroup) =>
    remove
      .mutateAsync({ orgId, notificationIds: group.items.map((notification) => notification.id) })
      .then(() =>
        toast({
          tone: "ok",
          title:
            group.items.length > 1
              ? `Deleted ${group.items.length} notifications`
              : "Notification deleted"
        })
      )
      .catch((error) => failed("Failed to delete notifications", error));

  const openGroup = (event: MouseEvent, group: NotificationGroup, href?: string) => {
    readGroup(group);
    if (!href) {
      setExpanded(expanded === group.key ? undefined : group.key);
      return;
    }
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    onClose();
    go(href);
  };

  const row = (group: NotificationGroup) => {
    const { latest, items } = group;
    const href = toHref(latest.link);
    return (
      <ListRow
        key={group.key}
        value={group.key}
        label={plainText(latest.title)}
        href={href}
        onClick={(event) => openGroup(event, group, href)}
        media={<Media size="sm" icon={notificationIcon(latest.type)} tone={group.tone} />}
        unread={group.unread > 0}
        title={<ReactMarkdown components={inline}>{latest.title}</ReactMarkdown>}
        badge={
          items.length > 1 && (
            <Count tone="neutral" aria-label={`${items.length} times`}>
              {`×${items.length > 99 ? "99+" : items.length}`}
            </Count>
          )
        }
        description={
          latest.body && (
            <span className={styles.body} data-expanded={expanded === group.key || undefined}>
              <ReactMarkdown components={inline}>{latest.body}</ReactMarkdown>
            </span>
          )
        }
        meta={
          <span className={styles.meta}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  icon="more"
                  iconOnly
                  className={styles.rowMenu}
                >
                  Notification actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {group.unread > 0 && (
                  <DropdownMenuItem onSelect={() => readGroup(group)}>
                    <Icon name="check" />
                    Mark as read
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem variant="destructive" onSelect={() => deleteGroup(group)}>
                  <Icon name="trash" />
                  {items.length > 1 ? `Delete all ${items.length}` : "Delete"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <time dateTime={latest.createdAt} title={new Date(latest.createdAt).toLocaleString()}>
              {shortTime(latest.createdAt)}
            </time>
          </span>
        }
      />
    );
  };

  return (
    <div className={styles.inbox}>
      <div className={styles.head}>
        {title}
        {unread > 0 && (
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
        )}
        {notifications.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" icon="more" iconOnly>
                More actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                variant="destructive"
                disabledReason={
                  notifications.some((notification) => notification.isRead)
                    ? undefined
                    : "Nothing has been read yet"
                }
                onSelect={() => setConfirmClear(true)}
              >
                <Icon name="trash" />
                Clear read
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {groups.length > 0 && (
        <Tabs
          className={styles.filters}
          label="Filter notifications"
          variant="segmented"
          width="full"
          value={filter}
          onChange={(value) => {
            setFilter(value as Filter);
            setShownCount(PAGE_SIZE);
          }}
          tabs={[
            { value: "all", label: "All" },
            { value: "unread", label: "Unread", count: unread || undefined },
            { value: "critical", label: "Critical", count: critical || undefined, countTone: "bad" }
          ]}
        />
      )}
      <div className={styles.scroll} data-scroll-fade="y">
        <List
          label="Notifications"
          variant="bare"
          loading={isPending}
          empty={<EmptyState size="sm" icon="bell" title={EMPTY_TITLES[filter]} />}
          footer={
            visible.length > shownCount && (
              <ShowMoreFooter
                status={`Showing ${shownCount.toLocaleString()} of ${visible.length.toLocaleString()}`}
                onShowMore={() => setShownCount(shownCount + PAGE_SIZE)}
              />
            )
          }
        >
          {today.length > 0 && <ListSection label="Today">{today.map(row)}</ListSection>}
          {earlier.length > 0 && <ListSection label="Earlier">{earlier.map(row)}</ListSection>}
        </List>
      </div>
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent tone="danger" pending={clearAll.isPending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear read notifications?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes your read notifications for this organization. This can&apos;t be undone.
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
                  toast({ tone: "ok", title: "Read notifications cleared" });
                } catch (error) {
                  failed("Failed to clear notifications", error);
                }
              }}
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export const NotificationInbox = ({
  orgId,
  inbox
}: {
  orgId: string;
  inbox: ReturnType<typeof useNotificationInbox>;
}) => {
  const shell = useAppShell();
  const narrow = Boolean(shell?.narrow);
  const setNavigationOpen = shell?.setNavigationOpen;
  useEffect(() => {
    if (narrow && inbox.open) setNavigationOpen?.(false);
  }, [narrow, inbox.open, setNavigationOpen]);
  const close = () => inbox.onOpenChange(false);
  const body = (title: ReactNode) => (
    <InboxBody
      orgId={orgId}
      notifications={inbox.notifications}
      isPending={inbox.isPending}
      onClose={close}
      title={title}
    />
  );
  if (narrow)
    return (
      <Sheet open={inbox.open} onOpenChange={inbox.onOpenChange}>
        <SheetContent side="bottom" aria-describedby={undefined} className={styles.sheet}>
          {inbox.open && body(<SheetTitle className={styles.title}>Notifications</SheetTitle>)}
        </SheetContent>
      </Sheet>
    );
  return (
    inbox.open && (
      <PopoverContent align="end" side="bottom" className={styles.popover}>
        {body(<h2 className={styles.title}>Notifications</h2>)}
      </PopoverContent>
    )
  );
};
