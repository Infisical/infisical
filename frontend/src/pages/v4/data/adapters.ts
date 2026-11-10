import { useRouteContext } from "@tanstack/react-router";

import type { AccessAdapter } from "./access/contract";
import type { AgentVaultAdapter } from "./agent-vault/contract";
import type { BillingAdapter } from "./billing/contract";
import type { CertificatesAdapter } from "./certificates/contract";
import type { IntegrationsAdapter } from "./integrations/contract";
import type { KmipAdapter } from "./kmip/contract";
import type { KmsAdapter } from "./kms/contract";
import type { OrgAdapter } from "./org/contract";
import type { PamAdapter } from "./pam/contract";
import type { ProjectsAdapter } from "./projects/contract";
import type { SecretScanningAdapter } from "./secret-scanning/contract";
import type { SecretsAdapter } from "./secrets/contract";
import type { SsoAdapter } from "./sso/contract";

export type V4Adapters = {
  kms: KmsAdapter;
  kmip: KmipAdapter;
  org: OrgAdapter;
  integrations: IntegrationsAdapter;
  secretScanning: SecretScanningAdapter;
  secrets: SecretsAdapter;
  certificates: CertificatesAdapter;
  access: AccessAdapter;
  projects: ProjectsAdapter;
  pam: PamAdapter;
  agentVault: AgentVaultAdapter;
  billing: BillingAdapter;
  sso: SsoAdapter;
};

export const useV4Mode = () => useRouteContext({ from: "/v4/organizations/$orgId" }).v4Mode;

export const useV4Adapter = <K extends keyof V4Adapters>(domain: K): V4Adapters[K] => {
  const { adapters } = useRouteContext({ from: "/v4/organizations/$orgId" });
  return adapters[domain];
};
