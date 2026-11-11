import { useMatches } from "@tanstack/react-router";

import type { V4Mode } from "../mode";
import type { AccessApprovalsAdapter } from "./access-approvals/contract";
import type { AccessAdapter } from "./access/contract";
import type { AdminAdapter } from "./admin/contract";
import type { AgentVaultSettingsAdapter } from "./agent-vault-settings/contract";
import type { AgentVaultAdapter } from "./agent-vault/contract";
import type { ApprovalPoliciesAdapter } from "./approval-policies/contract";
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
import type { SecretSharingAdapter } from "./secret-sharing/contract";
import type { SecretsAdapter } from "./secrets/contract";
import type { SsoAdapter } from "./sso/contract";

export type V4Adapters = {
  kms: KmsAdapter;
  kmip: KmipAdapter;
  org: OrgAdapter;
  integrations: IntegrationsAdapter;
  networking: NetworkingAdapter;
  secretScanning: SecretScanningAdapter;
  secretSharing: SecretSharingAdapter;
  secrets: SecretsAdapter;
  certificates: CertificatesAdapter;
  certManagerSettings: CertManagerSettingsAdapter;
  access: AccessAdapter;
  accessApprovals: AccessApprovalsAdapter;
  projects: ProjectsAdapter;
  projectSettings: ProjectSettingsAdapter;
  projectIntegrations: ProjectIntegrationsAdapter;
  projectEnvironments: ProjectEnvironmentsAdapter;
  projectTags: ProjectTagsAdapter;
  pam: PamAdapter;
  secretPolicies: SecretPoliciesAdapter;
  approvalPolicies: ApprovalPoliciesAdapter;
  agentVault: AgentVaultAdapter;
  auditLogs: AuditLogsAdapter;
  admin: AdminAdapter;
  agentVaultSettings: AgentVaultSettingsAdapter;
  billing: BillingAdapter;
  sso: SsoAdapter;
};

type V4RouteContext = { v4Mode?: V4Mode; adapters?: V4Adapters };

// Org pages and the admin console each set v4Mode and adapters in their layout route's beforeLoad.
// Read them from that layout match, not the nearest one: when the router adds search defaults to
// the URL on first load, a child match can keep the context it had before beforeLoad finished.
const useV4LayoutContext = (): V4RouteContext =>
  useMatches({
    select: (matches) =>
      matches.reduce<V4RouteContext>((found, match) => {
        const context = match.context as V4RouteContext;
        return context.v4Mode ? context : found;
      }, {})
  }) as V4RouteContext;

export const useV4Mode = (): V4Mode => useV4LayoutContext().v4Mode!;

export const useV4Adapter = <K extends keyof V4Adapters>(domain: K): V4Adapters[K] =>
  useV4LayoutContext().adapters![domain];
