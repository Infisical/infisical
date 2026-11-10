import {
  useCreateDynamicSecret,
  useDeleteDynamicSecret,
  useUpdateDynamicSecret
} from "@app/hooks/api/dynamicSecret/mutation";
import { useGetDynamicSecretDetails } from "@app/hooks/api/dynamicSecret/queries";
import {
  useCreateDynamicSecretLease,
  useRenewDynamicSecretLease,
  useRevokeDynamicSecretLease
} from "@app/hooks/api/dynamicSecretLease/mutation";
import { useGetDynamicSecretLeases } from "@app/hooks/api/dynamicSecretLease/queries";
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
import { secretsAccessLive } from "./live-access";
import { secretsCommitsLive } from "./live-commits";
import { secretsManagedLive } from "./live-managed";

export const secretsFlowsLive: SecretsFlowsAdapter = {
  ...secretsManagedLive,
  ...secretsCommitsLive,
  ...secretsAccessLive,
  useDynamicSecretDetails: useGetDynamicSecretDetails,
  useCreateDynamicSecret,
  useUpdateDynamicSecret,
  useDeleteDynamicSecret,
  useDynamicSecretLeases: useGetDynamicSecretLeases,
  useCreateDynamicSecretLease,
  useRenewDynamicSecretLease,
  useRevokeDynamicSecretLease,
  useSecretVersions: useGetSecretVersion,
  useSecretVersionValue: useGetSecretVersionValue,
  useRedactSecretVersion: useRedactSecretValue,
  useSecretAccessList: useGetSecretAccessList,
  useCreateSharedSecret,
  useCreateReminder,
  useDeleteReminder,
  useProjectFolders: useListProjectEnvironmentsFolders,
  useSecretsAt: useGetProjectSecrets,
  useCreateSecretBatch: (options) => useCreateSecretBatch({ options: { meta: options } }),
  useUpdateSecretBatch,
  useMoveSecrets,
  useMoveFolder,
  useCreateCommit,
  useDeleteEnvironment: useDeleteWsEnvironment,
  useCreateSecretImport,
  useDeleteSecretImport,
  useResyncSecretImport: useResyncSecretReplication
};
