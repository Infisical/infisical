import { useQueryClient } from "@tanstack/react-query";

import {
  secretKeyExistsQueryOptions,
  useGetProjectSecretsOverview,
  useGetSecretValue
} from "@app/hooks/api/dashboard/queries";
import { useCreateWsEnvironment } from "@app/hooks/api/projects/queries";
import {
  useCreateFolder,
  useDeleteFolder,
  useUpdateFolder
} from "@app/hooks/api/secretFolders/queries";
import { useGetImportedSecretsAllEnvs } from "@app/hooks/api/secretImports/queries";
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
import type { ScopeState, SecretsAdapter } from "./contract";
import { secretsAccessInsightsLive } from "./live-access-insights";
import { secretsActivationLive } from "./live-activation";
import { secretsChangeRequestsLive } from "./live-change-requests";
import { secretsExternalImportLive } from "./live-external-import";
import { secretsFlowsLive } from "./live-flows";
import { secretsPlanLive } from "./live-plan";
import { secretsQuickSearchLive } from "./live-quick-search";
import { secretsReminderChannelsLive } from "./live-reminder-channels";
import { secretsUpgradeLive } from "./live-upgrade";

export const secretsLive: SecretsAdapter = {
  ...secretsFlowsLive,
  ...secretsChangeRequestsLive,
  ...secretsUpgradeLive,
  ...secretsAccessInsightsLive,
  ...secretsReminderChannelsLive,
  ...secretsQuickSearchLive,
  ...secretsExternalImportLive,
  ...secretsPlanLive,
  ...secretsActivationLive,
  useProject: useProjectById,
  useCreateEnvironment: useCreateWsEnvironment,
  useTags: useGetWsTags,
  useCreateTag: (options) => useCreateWsTag({ meta: options?.meta }),
  useOverview: useGetProjectSecretsOverview,
  useSecretValue: useGetSecretValue,
  useImportedSecrets: ({ projectId, environments, path }) => {
    const { secretImports } = useGetImportedSecretsAllEnvs({ projectId, environments, path });
    return Object.fromEntries(
      environments.map((environment, index) => {
        const query = secretImports[index];
        let status: ScopeState = "loading";
        if (query?.data) status = "loaded";
        else if (query?.isError) status = "failed";
        return [
          environment,
          {
            status,
            groups: (query?.data ?? []).map((group) => ({
              importId: group.importId,
              environment: group.environment,
              secretPath: group.secretPath,
              secrets: group.secrets
            }))
          }
        ];
      })
    );
  },
  useSecretKeyCheck: () => {
    const queryClient = useQueryClient();
    return (dto) => queryClient.fetchQuery(secretKeyExistsQueryOptions(dto));
  },
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
