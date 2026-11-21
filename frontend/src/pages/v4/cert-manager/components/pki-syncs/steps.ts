import type { FieldPath } from "react-hook-form";

import type { TPkiSyncForm } from "@app/components/pki-syncs/forms/schemas/pki-sync-schema";
import {
  isPaloAltoNetworksPkiSync,
  PALO_ALTO_NETWORKS_PRIVATE_KEY_NOTE
} from "@app/helpers/pkiSyncs";
import { PkiSync } from "@app/hooks/api/pkiSyncs/enums";

export type PkiSyncStepKey =
  | "destination"
  | "targetHost"
  | "options"
  | "mappings"
  | "hostCommands"
  | "details"
  | "certificates"
  | "review";

export type PkiSyncStep = {
  key: PkiSyncStepKey;
  title: string;
  description?: string;
  fields: FieldPath<TPkiSyncForm>[];
};

const HOST_COMMANDS_NOTE =
  "The health check runs first. If the host isn't ready, the sync stops and no certificate is delivered. The post-sync command runs after the certificates are written, so a service can reload and pick up the new one. It only runs when the sync delivers a file. If either command fails, the sync is marked failed.";

const TARGET_HOST_NOTE =
  "An LDAP connection supplies the credential for a whole domain rather than one machine, so each sync names its own host. Machines found in the directory are offered as suggestions, and you can enter one that isn't listed.";

export const hasFieldMappings = (destination: PkiSync) =>
  destination === PkiSync.Chef || destination === PkiSync.AwsSecretsManager;

export const pkiSyncSteps = ({
  destination,
  canRunHostCommands,
  needsTargetHost,
  mode
}: {
  destination: PkiSync;
  canRunHostCommands: boolean;
  needsTargetHost: boolean;
  mode: "create" | "edit";
}): PkiSyncStep[] => {
  const certificatesNote =
    mode === "create"
      ? "Anything in the application matching these filters is synced as it's issued. A sync with no filters syncs nothing."
      : "Anything in the application matching these filters is synced as it's issued, and anything that stops matching is no longer synced. Nothing changes until you save.";
  const steps: PkiSyncStep[] = [
    { key: "destination", title: "Destination", fields: ["connection", "destinationConfig"] }
  ];
  if (needsTargetHost)
    steps.push({
      key: "targetHost",
      title: "Target host",
      description: TARGET_HOST_NOTE,
      fields: ["destinationConfig"]
    });
  steps.push({
    key: "options",
    title: "Sync options",
    fields: ["syncOptions", "credentials" as FieldPath<TPkiSyncForm>, "isAutoSyncEnabled"]
  });
  if (hasFieldMappings(destination))
    steps.push({ key: "mappings", title: "Field mappings", fields: ["syncOptions"] });
  const certificates: PkiSyncStep = {
    key: "certificates",
    title: "Certificates",
    description: isPaloAltoNetworksPkiSync(destination)
      ? `${certificatesNote} ${PALO_ALTO_NETWORKS_PRIVATE_KEY_NOTE}`
      : certificatesNote,
    fields: ["filters"]
  };
  const details: PkiSyncStep = {
    key: "details",
    title: "Details",
    fields: ["name", "description"]
  };
  const hostCommands: PkiSyncStep = {
    key: "hostCommands",
    title: "Commands",
    description: HOST_COMMANDS_NOTE,
    fields: [
      "syncOptions.healthCheckCommand" as FieldPath<TPkiSyncForm>,
      "syncOptions.postSyncCommand" as FieldPath<TPkiSyncForm>
    ]
  };
  if (mode === "create") {
    steps.push(details, certificates);
    if (canRunHostCommands) steps.push(hostCommands);
    steps.push({ key: "review", title: "Review", fields: [] });
    return steps;
  }
  if (canRunHostCommands) steps.push(hostCommands);
  steps.push(certificates, details);
  return steps;
};
