import { useGetProjectSecretsOverview, useGetSecretValue } from "@app/hooks/api/dashboard/queries";
import { useCreateWsEnvironment } from "@app/hooks/api/projects/queries";
import {
  useCreateFolder,
  useDeleteFolder,
  useUpdateFolder
} from "@app/hooks/api/secretFolders/queries";
import {
  useCreateSecretV3,
  useDeleteSecretBatch,
  useDeleteSecretV3,
  useUpdateSecretV3
} from "@app/hooks/api/secrets/mutations";
import {
  useGetExpandedSecretValue,
  useGetSecretReferences,
  useGetSecretReferenceTree
} from "@app/hooks/api/secrets/queries";
import { useCreateWsTag, useGetWsTags } from "@app/hooks/api/tags/queries";

import { withMutationMeta } from "../contract";
import { useProjectById } from "../projectQuery";
import type { SecretsAdapter } from "./contract";
import { secretsChangeRequestsLive } from "./live-change-requests";
import { secretsFlowsLive } from "./live-flows";

export const secretsLive: SecretsAdapter = {
  ...secretsFlowsLive,
  ...secretsChangeRequestsLive,
  useProject: useProjectById,
  useCreateEnvironment: useCreateWsEnvironment,
  useTags: useGetWsTags,
  useCreateTag: (options) => useCreateWsTag({ meta: options?.meta }),
  useOverview: useGetProjectSecretsOverview,
  useSecretValue: useGetSecretValue,
  useSecretReferenceTree: useGetSecretReferenceTree,
  useSecretReferences: useGetSecretReferences,
  useExpandedSecretValue: useGetExpandedSecretValue,
  useCreateSecret: withMutationMeta(useCreateSecretV3),
  useUpdateSecret: withMutationMeta(useUpdateSecretV3),
  useDeleteSecret: withMutationMeta(useDeleteSecretV3),
  useDeleteSecretBatch: withMutationMeta(useDeleteSecretBatch),
  useCreateFolder,
  useUpdateFolder,
  useDeleteFolder
};
