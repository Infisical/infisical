import type { DeleteEnvironmentDTO } from "@app/hooks/api/projects/types";
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
  SecretV3RawSanitized,
  TCreateCommitResponse,
  TCreateSecretBatchDTO,
  TGetProjectSecretsDTO,
  TMoveSecretsDTO,
  TUpdateSecretBatchDTO
} from "@app/hooks/api/secrets/types";
import type { PendingChanges } from "@app/pages/secret-manager/SecretDashboardPage/SecretMainPage.store";

import type { V4Mutation, V4QueryResult } from "../contract";

export type TCreateCommitDTO = {
  projectId: string;
  environment: string;
  secretPath: string;
  pendingChanges: PendingChanges;
  message: string;
};

export type SecretsFlowsAdapter = {
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
