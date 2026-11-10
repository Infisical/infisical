import { useRouteContext } from "@tanstack/react-router";

import type { V4Mode } from "../mode";
import type { AccessAdapter } from "./access/contract";
import type { AdminAdapter } from "./admin/contract";
import type { AgentVaultSettingsAdapter } from "./agent-vault-settings/contract";
import type { AgentVaultAdapter } from "./agent-vault/contract";
import type { AuditLogsAdapter } from "./audit-logs/contract";
import type { BillingAdapter } from "./billing/contract";
import type { CertManagerSettingsAdapter } from "./cert-manager-settings/contract";
import type { CertificatesAdapter } from "./certificates/contract";
import type { IntegrationsAdapter } from "./integrations/contract";
import type { KmipAdapter } from "./kmip/contract";
import type { KmsAdapter } from "./kms/contract";
import type { NetworkingAdapter } from "./networking/contract";
import type { OrgAdapter } from "./org/contract";
import type { PamAdapter } from "./pam/contract";
import type { ProjectEnvironmentsAdapter } from "./project-environments/contract";
import type { ProjectIntegrationsAdapter } from "./project-integrations/contract";
import type { ProjectSettingsAdapter } from "./project-settings/contract";
import type { ProjectTagsAdapter } from "./project-tags/contract";
import type { ProjectsAdapter } from "./projects/contract";
import type { SecretPoliciesAdapter } from "./secret-policies/contract";
import type { SecretScanningAdapter } from "./secret-scanning/contract";
import type { SecretsAdapter } from "./secrets/contract";
import type { SsoAdapter } from "./sso/contract";

export type V4Adapters = {
  kms: KmsAdapter;
  kmip: KmipAdapter;
  org: OrgAdapter;
  integrations: IntegrationsAdapter;
  networking: NetworkingAdapter;
  secretScanning: SecretScanningAdapter;
  secrets: SecretsAdapter;
  certificates: CertificatesAdapter;
  certManagerSettings: CertManagerSettingsAdapter;
  access: AccessAdapter;
  projects: ProjectsAdapter;
  projectSettings: ProjectSettingsAdapter;
  projectIntegrations: ProjectIntegrationsAdapter;
  projectEnvironments: ProjectEnvironmentsAdapter;
  projectTags: ProjectTagsAdapter;
  pam: PamAdapter;
  secretPolicies: SecretPoliciesAdapter;
  agentVault: AgentVaultAdapter;
  auditLogs: AuditLogsAdapter;
  admin: AdminAdapter;
  agentVaultSettings: AgentVaultSettingsAdapter;
  billing: BillingAdapter;
  sso: SsoAdapter;
};

type V4RouteContext = { v4Mode?: V4Mode; adapters?: V4Adapters };

// Org pages and the admin console each set v4Mode and adapters on their own layout route.
export const useV4Mode = (): V4Mode =>
  useRouteContext({ strict: false, select: (context: V4RouteContext) => context.v4Mode })!;

export const useV4Adapter = <K extends keyof V4Adapters>(domain: K): V4Adapters[K] =>
  useRouteContext({
    strict: false,
    select: (context: V4RouteContext) => context.adapters![domain]
  }) as V4Adapters[K];
