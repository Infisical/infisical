import type { IconName } from "@infisical/cipher/ui/icon";

import { NotificationType, type TUserNotification } from "@app/hooks/api/notifications/types";

export type NotificationTone = "bad" | "warn" | undefined;

export type NotificationGroup = {
  key: string;
  latest: TUserNotification;
  items: TUserNotification[];
  unread: number;
  tone: NotificationTone;
};

const ICONS: Partial<Record<NotificationType, IconName>> = {
  [NotificationType.GATEWAY_HEALTH_ALERT]: "server",
  [NotificationType.RELAY_HEALTH_ALERT]: "server",
  [NotificationType.ACCESS_APPROVAL_REQUEST]: "shield-user",
  [NotificationType.ACCESS_APPROVAL_REQUEST_UPDATED]: "shield-user",
  [NotificationType.PROJECT_ACCESS_REQUEST]: "shield-user",
  [NotificationType.APPROVAL_REQUIRED]: "shield-check",
  [NotificationType.ACCESS_POLICY_BYPASSED]: "shield",
  [NotificationType.PAM_ACCESS_POLICY_BYPASSED]: "shield",
  [NotificationType.SECRET_CHANGE_POLICY_BYPASSED]: "shield",
  [NotificationType.SECRET_CHANGE_REQUEST]: "git",
  [NotificationType.SECRET_ROTATION_FAILED]: "sync",
  [NotificationType.CREDENTIAL_ROTATION_FAILED]: "sync",
  [NotificationType.SECRET_SYNC_FAILED]: "arrow-right-left",
  [NotificationType.PKI_SYNC_FAILED]: "arrow-right-left",
  [NotificationType.SECRET_SCANNING_SECRETS_DETECTED]: "scan-search",
  [NotificationType.SECRET_SCANNING_SCAN_FAILED]: "scan-search",
  [NotificationType.LOGIN_FROM_NEW_DEVICE]: "sign-in",
  [NotificationType.ADMIN_SSO_BYPASS]: "sign-in",
  [NotificationType.IMPORT_STARTED]: "upload",
  [NotificationType.IMPORT_SUCCESSFUL]: "upload",
  [NotificationType.IMPORT_FAILED]: "upload",
  [NotificationType.DIRECT_PROJECT_ACCESS_ISSUED_TO_ADMIN]: "key",
  [NotificationType.PAM_FOLDER_ADMIN_ACCESS_ISSUED]: "key",
  [NotificationType.PROJECT_INVITATION]: "user-plus",
  [NotificationType.APPROVED_ACTION_FAILED]: "alert",
  [NotificationType.PKI_ALERT_CHANNEL_FAILED]: "cert",
  [NotificationType.HONEY_TOKEN_TRIGGERED]: "honey"
};

const CRITICAL = new Set<NotificationType>([
  NotificationType.GATEWAY_HEALTH_ALERT,
  NotificationType.RELAY_HEALTH_ALERT,
  NotificationType.HONEY_TOKEN_TRIGGERED,
  NotificationType.ADMIN_SSO_BYPASS
]);

const FAILURES = new Set<NotificationType>([
  NotificationType.SECRET_ROTATION_FAILED,
  NotificationType.CREDENTIAL_ROTATION_FAILED,
  NotificationType.SECRET_SYNC_FAILED,
  NotificationType.PKI_SYNC_FAILED,
  NotificationType.SECRET_SCANNING_SCAN_FAILED,
  NotificationType.SECRET_SCANNING_SECRETS_DETECTED,
  NotificationType.IMPORT_FAILED,
  NotificationType.APPROVED_ACTION_FAILED,
  NotificationType.PKI_ALERT_CHANNEL_FAILED
]);

export const notificationIcon = (type: NotificationType): IconName => ICONS[type] ?? "bell";

export const notificationTone = (type: NotificationType): NotificationTone => {
  if (CRITICAL.has(type)) return "bad";
  if (FAILURES.has(type)) return "warn";
  return undefined;
};

export const groupNotifications = (notifications: TUserNotification[]): NotificationGroup[] => {
  const groups = new Map<string, NotificationGroup>();
  [...notifications]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .forEach((notification) => {
      const key = [
        notification.type,
        notification.title,
        notification.body,
        notification.link
      ].join("\u0000");
      const group = groups.get(key);
      if (group) {
        group.items.push(notification);
        if (!notification.isRead) group.unread += 1;
        return;
      }
      groups.set(key, {
        key,
        latest: notification,
        items: [notification],
        unread: notification.isRead ? 0 : 1,
        tone: notificationTone(notification.type)
      });
    });
  return [...groups.values()];
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const shortTime = (iso: string, now = Date.now()) => {
  const elapsed = Math.max(0, now - Date.parse(iso));
  if (elapsed < MINUTE) return "now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
