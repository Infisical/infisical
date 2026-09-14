import type { GlobalCommandMenuItem } from "@app/components/v3/generic/Command";

const PRIVATE_ACTION_TYPES = [
  ["entity-project-", "Project"],
  ["entity-organization-", "Organization"],
  ["entity-team-", "Team"],
  ["project-resource-folder-", "Folder"],
  ["project-resource-dynamic-", "Dynamic Secret"],
  ["project-resource-rotation-", "Secret Rotation"],
  ["project-resource-secret-", "Secret"]
] as const;

export const getRootCommandMenuAction = ({
  id,
  label
}: Pick<GlobalCommandMenuItem, "id" | "label">) =>
  PRIVATE_ACTION_TYPES.find(([prefix]) => id.startsWith(prefix))?.[1] ?? label;
