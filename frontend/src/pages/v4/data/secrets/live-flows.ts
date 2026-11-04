import { useDeleteWsEnvironment } from "@app/hooks/api/projects/queries";
import {
  useListProjectEnvironmentsFolders,
  useMoveFolder
} from "@app/hooks/api/secretFolders/queries";
import {
  useCreateSecretImport,
  useDeleteSecretImport,
  useResyncSecretReplication
} from "@app/hooks/api/secretImports/mutation";
import {
  useCreateCommit,
  useCreateSecretBatch,
  useMoveSecrets,
  useUpdateSecretBatch
} from "@app/hooks/api/secrets/mutations";
import { useGetProjectSecrets } from "@app/hooks/api/secrets/queries";

import type { SecretsFlowsAdapter } from "./contract-flows";

export const secretsFlowsLive: SecretsFlowsAdapter = {
  useProjectFolders: useListProjectEnvironmentsFolders,
  useSecretsAt: useGetProjectSecrets,
  useCreateSecretBatch,
  useUpdateSecretBatch,
  useMoveSecrets,
  useMoveFolder,
  useCreateCommit,
  useDeleteEnvironment: useDeleteWsEnvironment,
  useCreateSecretImport,
  useDeleteSecretImport,
  useResyncSecretImport: useResyncSecretReplication
};
