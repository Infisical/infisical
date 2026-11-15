import { SecretFolderRole } from "@app/hooks/api/folderAccess/types";
import {
  type TUnusedAccessPaths,
  UnusedAccessActorType
} from "@app/hooks/api/secretInsights/types";

export const ACTOR_TYPE: Record<
  UnusedAccessActorType,
  { icon: "user" | "machine"; label: string }
> = {
  [UnusedAccessActorType.User]: { icon: "user", label: "User" },
  [UnusedAccessActorType.Identity]: { icon: "machine", label: "Machine Identity" }
};

const FOLDER_ROLE_LABELS: Record<SecretFolderRole, string> = {
  [SecretFolderRole.List]: "List",
  [SecretFolderRole.Read]: "Read",
  [SecretFolderRole.Edit]: "Edit",
  [SecretFolderRole.Manage]: "Manage",
  [SecretFolderRole.FullAccess]: "Full Access"
};

export const accessPathLabels = (
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
    label: `Folder: ${environmentName(access.environment)} ${access.secretPath} (${FOLDER_ROLE_LABELS[access.role] ?? access.role})`
  }))
];

// Only reads 0 or 100 when it is exactly that.
export const unusedSharePercent = (unusedSecretCount: number, accessibleSecretCount: number) => {
  if (unusedSecretCount >= accessibleSecretCount) return 100;
  return Math.min(
    99,
    Math.max(1, Math.round((unusedSecretCount / Math.max(1, accessibleSecretCount)) * 100))
  );
};

export const unusedShareTone = (percent: number) => {
  if (percent >= 75) return "bad" as const;
  if (percent >= 25) return "warn" as const;
  return "ok" as const;
};

export const formatRemainingTtl = (seconds: number) => {
  if (seconds < 60) {
    const remaining = Math.max(1, seconds);
    return `${remaining} ${remaining === 1 ? "second" : "seconds"}`;
  }
  if (seconds < 60 * 60) {
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }
  const hours = Math.ceil(seconds / (60 * 60));
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
};
