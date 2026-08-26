import { format } from "date-fns";

import {
  TFolderAccess,
  TFolderAccessIdentity,
  TFolderAccessUser
} from "@app/hooks/api/folderAccess";
import { ms } from "@app/lib/fn/time";

export type TFolderAccessActor = {
  type: "user" | "identity";
  id: string;
  membershipId: string | null;
  name: string;
  subtitle: string;
  initials: string;
  access: TFolderAccess | null;
};

const initialsOf = (value: string) =>
  value
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

export const toUserActor = (user: TFolderAccessUser): TFolderAccessActor => {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  const name = fullName || user.username;
  return {
    type: "user",
    id: user.userId,
    membershipId: user.membershipId,
    name,
    subtitle: user.email ?? user.username,
    initials: initialsOf(name),
    access: user.folderRBACAccess
  };
};

export const toIdentityActor = (identity: TFolderAccessIdentity): TFolderAccessActor => ({
  type: "identity",
  id: identity.identityId,
  membershipId: null,
  name: identity.name,
  subtitle: "Machine identity",
  initials: initialsOf(identity.name),
  access: identity.folderRBACAccess
});

export const byName = (a: TFolderAccessActor, b: TFolderAccessActor) =>
  a.name.localeCompare(b.name);

export const isValidTemporaryRange = (value: string) => {
  if (!value.trim()) return false;
  try {
    return Number(ms(value)) > 0;
  } catch {
    return false;
  }
};

export const expiryOf = (access: TFolderAccess | null) =>
  access?.isTemporary && access.temporaryAccessEndTime
    ? new Date(access.temporaryAccessEndTime)
    : null;

export const formatExpiryFull = (expiresAt: Date) => format(expiresAt, "MMM d, yyyy, h:mm a");

export const formatExpirationTime = (expiresAt: string, now: number, suffix?: string) => {
  const remainingSeconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
  if (remainingSeconds === 0) {
    return {
      expiresAt: new Date(expiresAt),
      isExpired: true,
      value: "Expired"
    };
  }

  const days = Math.floor(remainingSeconds / 86400);
  const hours = Math.floor((remainingSeconds % 86400) / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;

  if (days > 0)
    return {
      expiresAt: new Date(expiresAt),
      isExpired: false,
      value: `${days}d ${hours}h${suffix ? ` ${suffix}` : ""}`
    };
  if (hours > 0) {
    return {
      expiresAt: new Date(expiresAt),
      isExpired: false,
      value: `${hours}h ${minutes}m${suffix ? ` ${suffix}` : ""}`
    };
  }
  return {
    isExpired: false,
    value: `${minutes}m ${seconds}s${suffix ? ` ${suffix}` : ""}`
  };
};
