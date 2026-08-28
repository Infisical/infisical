import { SecretFolderRole } from "@app/hooks/api/folderAccess";

export type TFolderRoleTier = {
  value: SecretFolderRole;
  label: string;
  description: string;
};

// ordered least to most privileged; each tier is a superset of the one above it
export const FOLDER_ROLE_TIERS: TFolderRoleTier[] = [
  {
    value: SecretFolderRole.List,
    label: "List",
    description: "Can see secret and import names, not values."
  },
  {
    value: SecretFolderRole.Read,
    label: "Read",
    description: "Can read secret values and generate dynamic credentials."
  },
  {
    value: SecretFolderRole.Edit,
    label: "Edit",
    description: "Can add, edit, and delete secrets."
  },
  {
    value: SecretFolderRole.Manage,
    label: "Manage",
    description: "Can manage rotations, dynamic secrets, and honey tokens."
  },
  {
    value: SecretFolderRole.FullAccess,
    label: "Full Access",
    description:
      "Everything in Configure, plus deleting the folder and granting or revoking access to it."
  }
];

export const FOLDER_ROLE_TIER_LABELS: Record<SecretFolderRole, string> = FOLDER_ROLE_TIERS.reduce(
  (acc, tier) => ({ ...acc, [tier.value]: tier.label }),
  {} as Record<SecretFolderRole, string>
);

export const TEMPORARY_RANGE_PRESETS = ["30m", "4h", "1d"];

export const DEFAULT_TEMPORARY_RANGE = "1h";
