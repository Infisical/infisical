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
  about: string[];
  fields: string[];
};

export const pkiSyncDocsHref = (destination: PkiSync) =>
  `https://infisical.com/docs/documentation/platform/pki/applications/certificate-syncs/${destination}`;

const ABOUT: Record<Exclude<PkiSyncStepKey, "certificates">, string[]> = {
  destination: [
    "Choose the connection and where certificates go. The fields depend on the service."
  ],
  targetHost: [
    "An LDAP connection holds the credential for a whole domain, not one machine, so each sync names its own host.",
    "Machines found in the directory appear as suggestions, and you can enter one that isn't listed."
  ],
  options: [
    "Choose how certificates are written, such as whether stale certificates are removed and whether the root CA is included. With auto-sync on, changes sync as soon as they happen."
  ],
  mappings: ["Map the certificate, private key and chain to the field names the destination uses."],
  details: ["Name the sync so your team can find it later. The description is optional."],
  hostCommands: [
    "The health check runs first. If the host isn't ready, the sync stops and no certificate is delivered.",
    "The post-sync command runs after the certificates are written, so a service can reload and pick up the new one. It runs only when the sync delivers a file. If either command fails, the sync is marked failed."
  ],
  review: [
    "Check the configuration, then create the sync. You can change any setting later from the sync's details."
  ]
};

export const pkiSyncAbout = (
  key: PkiSyncStepKey,
  { destination, mode }: { destination: PkiSync; mode: "create" | "edit" }
): string[] => {
  if (key !== "certificates") return ABOUT[key];
  const lede =
    mode === "create"
      ? "Anything in the application that matches these filters syncs as it's issued. A sync with no filters syncs nothing."
      : "Anything in the application that matches these filters syncs as it's issued, and anything that stops matching stops syncing. Nothing changes until you save.";
  return isPaloAltoNetworksPkiSync(destination)
    ? [lede, PALO_ALTO_NETWORKS_PRIVATE_KEY_NOTE]
    : [lede];
};

export const pkiSyncEditAbout = (
  section: PkiSyncStepKey,
  { destination, isLdap }: { destination: PkiSync; isLdap: boolean }
) => [
  ...pkiSyncAbout(section, { destination, mode: "edit" }),
  ...(section === "destination" && isLdap ? ABOUT.targetHost : [])
];

export const hasFieldMappings = (destination: PkiSync) =>
  destination === PkiSync.Chef || destination === PkiSync.AwsSecretsManager;

export const pkiSyncSteps = ({
  destination,
  canRunHostCommands,
  needsTargetHost
}: {
  destination: PkiSync;
  canRunHostCommands: boolean;
  needsTargetHost: boolean;
}): PkiSyncStep[] => {
  const step = (key: PkiSyncStepKey, title: string, fields: string[]): PkiSyncStep => ({
    key,
    title,
    about: pkiSyncAbout(key, { destination, mode: "create" }),
    fields
  });
  return [
    step("destination", "Destination", ["connection", "destinationConfig"]),
    ...(needsTargetHost ? [step("targetHost", "Target host", ["destinationConfig"])] : []),
    step("options", "Sync options", ["syncOptions", "credentials", "isAutoSyncEnabled"]),
    ...(hasFieldMappings(destination) ? [step("mappings", "Field mappings", ["syncOptions"])] : []),
    step("details", "Details", ["name", "description"]),
    step("certificates", "Certificates", ["filters"]),
    ...(canRunHostCommands
      ? [
          step("hostCommands", "Commands", [
            "syncOptions.healthCheckCommand",
            "syncOptions.postSyncCommand"
          ])
        ]
      : []),
    step("review", "Review", [])
  ];
};
