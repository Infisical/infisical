import { useRouteContext } from "@tanstack/react-router";

import type { V4Mode } from "../mode";
import type { AccessAdapter } from "./access/contract";
import type { AdminAdapter } from "./admin/contract";
import type { AgentVaultAdapter } from "./agent-vault/contract";
import type { BillingAdapter } from "./billing/contract";
import type { CertificatesAdapter } from "./certificates/contract";
import type { IntegrationsAdapter } from "./integrations/contract";
import type { KmsAdapter } from "./kms/contract";
import type { OrgAdapter } from "./org/contract";
import type { PamAdapter } from "./pam/contract";
import type { ProjectsAdapter } from "./projects/contract";
import type { SecretScanningAdapter } from "./secret-scanning/contract";
import type { SecretsAdapter } from "./secrets/contract";
import type { SsoAdapter } from "./sso/contract";

export type V4Adapters = {
  kms: KmsAdapter;
  org: OrgAdapter;
  integrations: IntegrationsAdapter;
  secretScanning: SecretScanningAdapter;
  secrets: SecretsAdapter;
  certificates: CertificatesAdapter;
  access: AccessAdapter;
  projects: ProjectsAdapter;
  pam: PamAdapter;
  agentVault: AgentVaultAdapter;
  admin: AdminAdapter;
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
