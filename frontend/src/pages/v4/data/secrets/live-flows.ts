import { useDeleteWsEnvironment } from "@app/hooks/api/projects/queries";
import { useCreateReminder, useDeleteReminder } from "@app/hooks/api/reminders/queries";
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
  useRedactSecretValue,
  useUpdateSecretBatch
} from "@app/hooks/api/secrets/mutations";
import {
  useGetProjectSecrets,
  useGetSecretAccessList,
  useGetSecretVersion,
  useGetSecretVersionValue
} from "@app/hooks/api/secrets/queries";
import { useCreateSharedSecret } from "@app/hooks/api/secretSharing/mutations";

import type { SecretsFlowsAdapter } from "./contract-flows";

export const secretsFlowsLive: SecretsFlowsAdapter = {
  useSecretVersions: useGetSecretVersion,
  useSecretVersionValue: useGetSecretVersionValue,
  useRedactSecretVersion: useRedactSecretValue,
  useSecretAccessList: useGetSecretAccessList,
  useCreateSharedSecret,
  useCreateReminder,
  useDeleteReminder,
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
