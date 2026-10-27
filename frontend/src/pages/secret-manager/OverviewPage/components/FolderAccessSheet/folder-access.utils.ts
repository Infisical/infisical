import { format } from "date-fns";

import {
  TFolderAccess,
  TFolderAccessIdentity,
  TFolderAccessRole,
  TFolderAccessUser
} from "@app/hooks/api/folderAccess";
import { OrgUser } from "@app/hooks/api/users/types";
import { ms } from "@app/lib/fn/time";

export type TFolderAccessActor = {
  type: "user" | "identity";
  id: string;
  membershipId: string | null;
  name: string;
  subtitle: string;
  initials: string;
  isProjectAdmin: boolean;
  // with access: only the roles granting access on this folder; without access: every role
  roles: TFolderAccessRole[];
  access: TFolderAccess | null;
};

const sortRoles = (roles: TFolderAccessRole[]) =>
  [...roles].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

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
    membershipId: user.membership.id,
    name,
    subtitle: user.email ?? user.username,
    initials: initialsOf(name),
    isProjectAdmin: user.membership.isProjectAdmin,
    roles: sortRoles(user.membership.roles),
    access: user.folderRBACAccess
  };
};

export const toIdentityActor = (identity: TFolderAccessIdentity): TFolderAccessActor => ({
  type: "identity",
  id: identity.identityId,
  membershipId: identity.membership.id,
  name: identity.name,
  subtitle: "Machine identity",
  initials: initialsOf(identity.name),
  isProjectAdmin: identity.membership.isProjectAdmin,
  roles: sortRoles(identity.membership.roles),
  access: identity.folderRBACAccess
});

// organization members outside the project have no membership, roles, or grant here yet
export const toOrgUserActor = ({ user, inviteEmail, status }: OrgUser): TFolderAccessActor => {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  const email = user.email || inviteEmail || user.username;
  const name = fullName || email;
  return {
    type: "user",
    id: user.id,
    membershipId: null,
    name,
    subtitle: status === "invited" ? "Invite pending" : email,
    initials: initialsOf(name),
    isProjectAdmin: false,
    roles: [],
    access: null
  };
};

export const toOrgIdentityActor = ({
  id,
  name
}: {
  id: string;
  name: string;
}): TFolderAccessActor => ({
  type: "identity",
  id,
  membershipId: null,
  name,
  subtitle: "Machine identity",
  initials: initialsOf(name),
  isProjectAdmin: false,
  roles: [],
  access: null
});

export const byName = (a: TFolderAccessActor, b: TFolderAccessActor) =>
  a.name.localeCompare(b.name);

export const byAdminThenName = (a: TFolderAccessActor, b: TFolderAccessActor) =>
  Number(b.isProjectAdmin) - Number(a.isProjectAdmin) || byName(a, b);

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

// how removing a grant plays out: an expired grant no longer applies, so removing it only cleans up,
// while an active temporary grant is ended early
export const grantStateOf = (access: TFolderAccess | null) => {
  const expiresAt = expiryOf(access);
  if (!expiresAt) return "permanent" as const;
  return expiresAt.getTime() <= Date.now() ? ("expired" as const) : ("temporary" as const);
};

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
    expiresAt: new Date(expiresAt),
    isExpired: false,
    value: `${minutes}m ${seconds}s${suffix ? ` ${suffix}` : ""}`
  };
};

// SecretPathInput emits a trailing slash when a suggestion is picked, so `/foo/` and `/foo` both
// reach a form that has to compare the path against stored grants
export const normalizeFolderPath = (path: string) => {
  const segments = path.trim().split("/").filter(Boolean);
  return segments.length ? `/${segments.join("/")}` : "/";
};
