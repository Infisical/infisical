import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import {
  SecretSync,
  SecretSyncInitialSyncBehavior,
  SecretSyncStatus
} from "@app/hooks/api/secretSyncs/enums";
import type { TSecretSync } from "@app/hooks/api/secretSyncs/types";
import { getSecretSyncDestinationColValues } from "@app/pages/secret-manager/IntegrationsListPage/components/SecretSyncsTab/SecretSyncTable/helpers";

import { orgHref } from "../../../links";
import { integrationsHref, SECRET_SYNCS_TAB } from "../native-model";

export const SYNC_DOCS = "https://infisical.com/docs/integrations/secret-syncs/overview";

export const syncsHref = (orgId: string, projectId: string) =>
  integrationsHref(orgId, projectId, SECRET_SYNCS_TAB);

export const syncHref = (
  orgId: string,
  projectId: string,
  sync: { destination: SecretSync; id: string }
) =>
  orgHref(
    orgId,
    `/projects/secret-management/${projectId}/integrations/secret-syncs/${sync.destination}/${sync.id}`
  );

export const destinationNameOf = (destination: SecretSync) =>
  SECRET_SYNC_MAP[destination]?.name ?? destination;

export const destinationTextOf = (sync: TSecretSync) => {
  try {
    return getSecretSyncDestinationColValues(sync);
  } catch {
    return { primaryText: "-", secondaryText: undefined };
  }
};

export const sourcePathOf = (sync: TSecretSync) => {
  if (!sync.folder) return undefined;
  return sync.includeAllSubFolders
    ? `${sync.folder.path.replace(/\/+$/, "")}/**`
    : sync.folder.path;
};

export type SyncState = SecretSyncStatus | "never";

export const syncStateOf = (sync: TSecretSync): SyncState => sync.syncStatus ?? "never";

export const SYNC_STATE: Record<
  SyncState,
  {
    label: string;
    tone: "neutral" | "ok" | "bad";
    icon: "clock" | "check-c" | "alert";
    order: number;
  }
> = {
  [SecretSyncStatus.Failed]: { label: "Failed to sync", tone: "bad", icon: "alert", order: 0 },
  [SecretSyncStatus.Running]: { label: "Syncing", tone: "neutral", icon: "clock", order: 1 },
  [SecretSyncStatus.Pending]: { label: "Queued", tone: "neutral", icon: "clock", order: 1 },
  [SecretSyncStatus.Succeeded]: { label: "Synced", tone: "ok", icon: "check-c", order: 2 },
  never: { label: "Not synced yet", tone: "neutral", icon: "clock", order: 3 }
};

export const messageOf = (status: SecretSyncStatus | null, message: string | null) => {
  if (status !== SecretSyncStatus.Failed) return undefined;
  if (!message) return "An unknown error occurred.";
  try {
    return JSON.stringify(JSON.parse(message), null, 2);
  } catch {
    return message;
  }
};

export const INITIAL_SYNC_LABEL: Record<SecretSyncInitialSyncBehavior, (name: string) => string> = {
  [SecretSyncInitialSyncBehavior.OverwriteDestination]: (name) => `Overwrite ${name}`,
  [SecretSyncInitialSyncBehavior.ImportPrioritizeSource]: () =>
    "Import, prioritize Infisical values",
  [SecretSyncInitialSyncBehavior.ImportPrioritizeDestination]: (name) =>
    `Import, prioritize ${name} values`
};

const ACRONYMS: Record<string, string> = {
  id: "ID",
  ids: "IDs",
  url: "URL",
  uuid: "UUID",
  ocid: "OCID",
  uid: "UID",
  oci: "OCI",
  scim: "SCIM",
  kms: "KMS",
  aws: "AWS"
};

export const labelOf = (key: string) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (ACRONYMS[lower]) return ACRONYMS[lower];
      return index === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(" ");

export const plainValueOf = (value: unknown): string | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    if (!value.length) return undefined;
    return value
      .map((entry) =>
        typeof entry === "object" && entry !== null
          ? Object.values(entry as Record<string, unknown>).join("=")
          : String(entry)
      )
      .join(", ");
  }
  return undefined;
};
