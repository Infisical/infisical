import { useRouteContext } from "@tanstack/react-router";

import type { IntegrationsAdapter } from "./integrations/contract";
import type { KmsAdapter } from "./kms/contract";
import type { SecretScanningAdapter } from "./secret-scanning/contract";

export type V4Adapters = {
  kms: KmsAdapter;
  integrations: IntegrationsAdapter;
  secretScanning: SecretScanningAdapter;
};

export const useV4Adapter = <K extends keyof V4Adapters>(domain: K): V4Adapters[K] => {
  const { adapters } = useRouteContext({ from: "/v4/organizations/$orgId" });
  return adapters[domain];
};
