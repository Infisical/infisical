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
    name,
    subtitle: user.email ?? user.username,
    initials: initialsOf(name),
    access: user.folderRBACAccess
  };
};

export const toIdentityActor = (identity: TFolderAccessIdentity): TFolderAccessActor => ({
  type: "identity",
  id: identity.identityId,
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

export const formatExpiryShort = (date: Date) => format(date, "MMM d");

export const formatExpiryFull = (date: Date) => format(date, "MMM d, yyyy, h:mm a");
