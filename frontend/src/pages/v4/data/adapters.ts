import { useRouteContext } from "@tanstack/react-router";

import type { AccessAdapter } from "./access/contract";
import type { CertificatesAdapter } from "./certificates/contract";
import type { IntegrationsAdapter } from "./integrations/contract";
import type { KmsAdapter } from "./kms/contract";
import type { OrgAdapter } from "./org/contract";
import type { ProjectsAdapter } from "./projects/contract";
import type { SecretScanningAdapter } from "./secret-scanning/contract";
import type { SecretsAdapter } from "./secrets/contract";

export type V4Adapters = {
  kms: KmsAdapter;
  org: OrgAdapter;
  integrations: IntegrationsAdapter;
  secretScanning: SecretScanningAdapter;
  secrets: SecretsAdapter;
  certificates: CertificatesAdapter;
  access: AccessAdapter;
  projects: ProjectsAdapter;
};

export const useV4Adapter = <K extends keyof V4Adapters>(domain: K): V4Adapters[K] => {
  const { adapters } = useRouteContext({ from: "/v4/organizations/$orgId" });
  return adapters[domain];
};
