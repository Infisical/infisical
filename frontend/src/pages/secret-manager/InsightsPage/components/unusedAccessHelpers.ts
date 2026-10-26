import { HardDriveIcon, UserIcon } from "lucide-react";

import { TUnusedAccessPaths, UnusedAccessActorType } from "@app/hooks/api/secretInsights";
import { FOLDER_ROLE_TIER_LABELS } from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/folder-access.const";

export const ACTOR_TYPE_CONFIG: Record<
  UnusedAccessActorType,
  { icon: typeof UserIcon; label: string }
> = {
  [UnusedAccessActorType.User]: { icon: UserIcon, label: "User" },
  [UnusedAccessActorType.Identity]: { icon: HardDriveIcon, label: "Machine Identity" }
};

export const accessPathBadges = (
  { roles, additionalPrivileges, groups, folderAccess }: TUnusedAccessPaths,
  environmentName: (slug: string) => string
) => [
  ...roles.map((role) => ({
    key: `role:${role.slug}:${role.id ?? ""}`,
    label: `Role: ${role.name}`
  })),
  ...additionalPrivileges.map((privilege) => ({
    key: `privilege:${privilege.id}`,
    label: `Privilege: ${privilege.name}`
  })),
  ...groups.map((group) => ({
    key: `group:${group.id}`,
    label: group.roles.length
      ? `Group: ${group.name} (${group.roles.map((role) => role.name).join(", ")})`
      : `Group: ${group.name}`
  })),
  ...folderAccess.map((access) => ({
    key: `folder:${access.id}`,
    label: `Folder: ${environmentName(access.environment)} ${access.secretPath} (${FOLDER_ROLE_TIER_LABELS[access.role] ?? access.role})`
  }))
];

// The share of the secrets an actor can read that it has not read, as a whole percentage that only reads 0
// or 100 when it is exactly that.
export const unusedSharePercent = (unusedSecretCount: number, accessibleSecretCount: number) => {
  if (unusedSecretCount >= accessibleSecretCount) return 100;
  return Math.min(
    99,
    Math.max(1, Math.round((unusedSecretCount / Math.max(1, accessibleSecretCount)) * 100))
  );
};

// Most of its access unread is the strongest sign an actor has access it does not need.
export const unusedShareTone = (percent: number) => {
  if (percent >= 75) return { text: "text-danger", bar: "bg-danger" };
  if (percent >= 25) return { text: "text-warning", bar: "bg-warning" };
  return { text: "text-success", bar: "bg-success" };
};

export const formatRemainingTtl = (seconds: number) => {
  if (seconds < 60) {
    const remainingSeconds = Math.max(1, seconds);
    return `${remainingSeconds} ${remainingSeconds === 1 ? "second" : "seconds"}`;
  }
  if (seconds < 60 * 60) {
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }
  const hours = Math.ceil(seconds / (60 * 60));
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
};
