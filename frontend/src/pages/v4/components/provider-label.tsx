import * as React from "react";
import { NameLine } from "@infisical/cipher/ui/name-line";

import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { AUDIT_LOG_STREAM_PROVIDER_MAP } from "@app/helpers/auditLogStreams";
import { HONEY_TOKEN_MAP } from "@app/helpers/honeyTokens";
import { PKI_DISCOVERY_TYPE_MAP } from "@app/helpers/pkiDiscovery";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { SECRET_ROTATION_MAP } from "@app/helpers/secretRotationsV2";
import { SECRET_SCANNING_DATA_SOURCE_MAP } from "@app/helpers/secretScanningV2";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import type { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { LogProvider } from "@app/hooks/api/auditLogStreams/enums";
import type { HoneyTokenType } from "@app/hooks/api/honeyTokens/enums";
import { IdentityAuthMethod } from "@app/hooks/api/identities/enums";
import { identityAuthToNameMap } from "@app/hooks/api/identities/constants";
import type { PkiDiscoveryType } from "@app/hooks/api/pkiDiscovery/types";
import type { PkiSync } from "@app/hooks/api/pkiSyncs";
import type { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import type { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";
import type { SecretSync } from "@app/hooks/api/secretSyncs";

import { ProviderIcon } from "./provider-icon";

export type Provider = { name: string; image?: string };

type ProviderKeys = {
  "app-connection": AppConnection;
  "audit-log-stream": LogProvider;
  "honey-token": HoneyTokenType;
  "identity-auth": IdentityAuthMethod;
  "pki-discovery": PkiDiscoveryType;
  "pki-sync": PkiSync;
  "secret-rotation": SecretRotation;
  "secret-scanning": SecretScanningDataSource;
  "secret-sync": SecretSync;
};

export type ProviderKind = keyof ProviderKeys;

const IDENTITY_AUTH_IMAGES: Partial<Record<IdentityAuthMethod, string>> = {
  [IdentityAuthMethod.AWS_AUTH]: "Amazon Web Services.png",
  [IdentityAuthMethod.GCP_AUTH]: "Google Cloud Platform.png",
  [IdentityAuthMethod.AZURE_AUTH]: "Microsoft Azure.png",
  [IdentityAuthMethod.KUBERNETES_AUTH]: "Kubernetes.png",
  [IdentityAuthMethod.ALICLOUD_AUTH]: "Alibaba Cloud.png",
  [IdentityAuthMethod.OCI_AUTH]: "Oracle.png",
  [IdentityAuthMethod.LDAP_AUTH]: "LDAP.png"
};

const PROVIDERS: { [K in ProviderKind]: (key: ProviderKeys[K]) => Provider | undefined } = {
  "app-connection": (key) => APP_CONNECTION_MAP[key],
  "audit-log-stream": (key) => AUDIT_LOG_STREAM_PROVIDER_MAP[key],
  "honey-token": (key) => HONEY_TOKEN_MAP[key],
  "identity-auth": (key) =>
    identityAuthToNameMap[key]
      ? { name: identityAuthToNameMap[key], image: IDENTITY_AUTH_IMAGES[key] }
      : undefined,
  "pki-discovery": (key) => PKI_DISCOVERY_TYPE_MAP[key],
  "pki-sync": (key) => PKI_SYNC_MAP[key],
  "secret-rotation": (key) => SECRET_ROTATION_MAP[key],
  "secret-scanning": (key) => SECRET_SCANNING_DATA_SOURCE_MAP[key],
  "secret-sync": (key) => SECRET_SYNC_MAP[key]
};

/** The name and logo file of a provider, from the helper map that owns its kind. */
export const providerOf = <K extends ProviderKind>(kind: K, key: ProviderKeys[K]) =>
  PROVIDERS[kind](key);

type ProviderSource =
  | { [K in ProviderKind]: { kind: K; value: ProviderKeys[K]; provider?: never } }[ProviderKind]
  | { kind?: never; value?: never; provider: Provider };

const resolve = (source: ProviderSource) =>
  source.provider ?? providerOf(source.kind as ProviderKind, source.value as never);

/**
 * The provider logo for a Cipher media slot (option rows, triggers, chips, badges, titles), or
 * undefined for a provider with no logo, which then shows its name alone.
 */
export const providerMedia = <K extends ProviderKind>(
  kind: K,
  key: ProviderKeys[K],
  size: "sm" | "md" = "sm"
) => {
  const image = providerOf(kind, key)?.image;
  return image ? <ProviderIcon icon={image} alt="" size={size} /> : undefined;
};

/**
 * A provider or integration name with its logo leading. Children replace the provider's own name,
 * such as a connection's name beside its app's logo.
 */
export function ProviderLabel({
  size,
  children,
  ...props
}: ProviderSource & {
  size?: "sm" | "md";
  children?: React.ReactNode;
  className?: string;
}) {
  const { className } = props;
  const provider = resolve(props as ProviderSource);
  const image = provider?.image;
  return (
    <NameLine
      className={className}
      media={image ? <ProviderIcon icon={image} alt="" size={size ?? "md"} /> : undefined}
    >
      {children ?? provider?.name}
    </NameLine>
  );
}
