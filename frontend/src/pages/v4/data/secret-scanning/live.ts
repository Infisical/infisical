import { useUpdateMultipleSecretScanningFinding } from "@app/hooks/api/secretScanningV2/mutations";
import {
  useGetSecretScanningProjectId,
  useGetSecretScanningUnresolvedFindingCount,
  useListSecretScanningBasicDataSources,
  useListSecretScanningBasicResources,
  useListSecretScanningFindings
} from "@app/hooks/api/secretScanningV2/queries";

import type { SecretScanningAdapter } from "./contract";

export const secretScanningLive: SecretScanningAdapter = {
  useProjectId: useGetSecretScanningProjectId,
  useFindings: useListSecretScanningFindings,
  useUnresolvedFindingCount: useGetSecretScanningUnresolvedFindingCount,
  useDataSources: useListSecretScanningBasicDataSources,
  useResources: useListSecretScanningBasicResources,
  useUpdateFindings: useUpdateMultipleSecretScanningFinding
};
