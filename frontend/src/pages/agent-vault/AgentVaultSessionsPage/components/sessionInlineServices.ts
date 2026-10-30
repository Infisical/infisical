import {
  TAgentVaultSession,
  TAgentVaultSessionAccessBundle,
  TAgentVaultSessionInlineService
} from "@app/hooks/api/agentVault/types";

// The same fallback the API uses wherever it names an inline service sent without a name: its first host.
export const inlineServiceDisplayName = ({
  name,
  hostPattern
}: Pick<TAgentVaultSessionInlineService, "name" | "hostPattern">) =>
  name || hostPattern.split(",")[0].trim();

export const inlineServicesLabel = (count: number) =>
  count === 1 ? "1 inline service" : `${count} inline services`;

export type TSessionAccessItem =
  | { kind: "bundle"; bundle: TAgentVaultSessionAccessBundle }
  | { kind: "inline"; services: TAgentVaultSessionInlineService[] };

// A session's bundle, then one more badge for the services it was sent with.
export const toAccessItems = (
  session: Pick<TAgentVaultSession, "accessBundles" | "services">
): TSessionAccessItem[] => [
  ...session.accessBundles.map((bundle) => ({ kind: "bundle" as const, bundle })),
  ...(session.services.length ? [{ kind: "inline" as const, services: session.services }] : [])
];
