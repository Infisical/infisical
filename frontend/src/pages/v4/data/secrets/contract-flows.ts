import type {
  TCreateDynamicSecretDTO,
  TDeleteDynamicSecretDTO,
  TDetailsDynamicSecretDTO,
  TDynamicSecret,
  TUpdateDynamicSecretDTO
} from "@app/hooks/api/dynamicSecret/types";
import type {
  TCreateDynamicSecretLeaseDTO,
  TDynamicSecretLease,
  TListDynamicSecretLeaseDTO,
  TRenewDynamicSecretLeaseDTO,
  TRevokeDynamicSecretLeaseDTO
} from "@app/hooks/api/dynamicSecretLease/types";
import type { DeleteEnvironmentDTO } from "@app/hooks/api/projects/types";
import type {
  CreateReminderDTO,
  DeleteReminderDTO,
  Reminder
} from "@app/hooks/api/reminders/types";
import type {
  TMoveFolderDTO,
  TMoveFolderResponse,
  TProjectEnvironmentsFolders
} from "@app/hooks/api/secretFolders/types";
import type {
  TCreateSecretImportDTO,
  TDeleteSecretImportDTO,
  TResyncSecretReplicationDTO
} from "@app/hooks/api/secretImports/types";
import type {
  GetSecretVersionsDTO,
  SecretAccessListEntry,
  SecretAccessListGroupEntry,
  SecretV3RawSanitized,
  SecretVersions,
  TGetSecretAccessListDTO,
  TGetSecretVersionValue,
  TCreateCommitResponse,
  TCreateSecretBatchDTO,
  TGetProjectSecretsDTO,
  TMoveSecretsDTO,
  TUpdateSecretBatchDTO
} from "@app/hooks/api/secrets/types";
import type {
  TCreatedSharedSecret,
  TCreateSharedSecretRequest
} from "@app/hooks/api/secretSharing/types";
import type { PendingChanges } from "@app/pages/secret-manager/SecretDashboardPage/SecretMainPage.store";

import type { V4Mutation, V4QueryResult } from "../contract";
import type { SecretsAccessAdapter } from "./contract-access";
import type { SecretsCommitsAdapter } from "./contract-commits";
import type { SecretsManagedAdapter } from "./contract-managed";

export type TCreateCommitDTO = {
  projectId: string;
  environment: string;
  secretPath: string;
  pendingChanges: PendingChanges;
  message: string;
};

export type TSecretAccessList = {
  groups: SecretAccessListGroupEntry[];
  identities: SecretAccessListEntry[];
  users: SecretAccessListEntry[];
};
type SecretScopedMutation<TVariables, TData> = (secretId: string) => {
  mutateAsync: (variables: TVariables) => Promise<TData>;
  isPending: boolean;
};

export type SecretsFlowsAdapter = SecretsManagedAdapter &
  SecretsCommitsAdapter &
  SecretsAccessAdapter & {
    useDynamicSecretDetails: (
      dto: TDetailsDynamicSecretDTO
    ) => V4QueryResult<TDynamicSecret & { inputs: unknown }>;
    useCreateDynamicSecret: V4Mutation<TCreateDynamicSecretDTO>;
    useUpdateDynamicSecret: V4Mutation<TUpdateDynamicSecretDTO>;
    useDeleteDynamicSecret: V4Mutation<TDeleteDynamicSecretDTO>;
    useDynamicSecretLeases: (
      dto: TListDynamicSecretLeaseDTO
    ) => V4QueryResult<TDynamicSecretLease[]>;
    useCreateDynamicSecretLease: V4Mutation<
      TCreateDynamicSecretLeaseDTO,
      { lease: TDynamicSecretLease; data: unknown }
    >;
    useRenewDynamicSecretLease: V4Mutation<TRenewDynamicSecretLeaseDTO>;
    useRevokeDynamicSecretLease: V4Mutation<TRevokeDynamicSecretLeaseDTO>;
    useSecretVersions: (dto: GetSecretVersionsDTO) => V4QueryResult<SecretVersions[]>;
    useSecretVersionValue: (
      dto: TGetSecretVersionValue,
      options?: { enabled?: boolean }
    ) => V4QueryResult<string>;
    useRedactSecretVersion: V4Mutation<{ versionId: string; secretId: string }>;
    useSecretAccessList: (dto: TGetSecretAccessListDTO) => V4QueryResult<TSecretAccessList>;
    useCreateSharedSecret: V4Mutation<TCreateSharedSecretRequest, TCreatedSharedSecret>;
    useCreateReminder: SecretScopedMutation<CreateReminderDTO, Reminder>;
    useDeleteReminder: SecretScopedMutation<DeleteReminderDTO, Reminder>;
    useProjectFolders: (projectId: string) => V4QueryResult<TProjectEnvironmentsFolders>;
    useSecretsAt: (
      dto: TGetProjectSecretsDTO & { options?: { enabled?: boolean } }
    ) => V4QueryResult<SecretV3RawSanitized[]>;
    useCreateSecretBatch: V4Mutation<TCreateSecretBatchDTO>;
    useUpdateSecretBatch: V4Mutation<TUpdateSecretBatchDTO>;
    useMoveSecrets: V4Mutation<
      TMoveSecretsDTO,
      { isSourceUpdated: boolean; isDestinationUpdated: boolean }
    >;
    useMoveFolder: V4Mutation<TMoveFolderDTO, TMoveFolderResponse>;
    useCreateCommit: V4Mutation<TCreateCommitDTO, TCreateCommitResponse>;
    useDeleteEnvironment: V4Mutation<DeleteEnvironmentDTO>;
    useCreateSecretImport: V4Mutation<TCreateSecretImportDTO>;
    useDeleteSecretImport: V4Mutation<TDeleteSecretImportDTO>;
    useResyncSecretImport: V4Mutation<TResyncSecretReplicationDTO>;
  };
