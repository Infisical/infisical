import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

import { apiRequest } from "@app/config/request";
import { useServerConfig } from "@app/context/ServerConfigContext";
import { useGetOrganizationById } from "@app/hooks/api/organization/queries";
import {
  useCreateProjectFolderGrant,
  useDeleteProjectFolderGrant,
  useGetProjectFolderGrantsUsageTotal,
  useListProjectFolderGrants
} from "@app/hooks/api/projectFolderGrants";
import { projectFolderGrantKeys } from "@app/hooks/api/projectFolderGrants/queries";
import type { TProjectFolderGrant } from "@app/hooks/api/projectFolderGrants/types";
import { useEnableSecretBlindIndex, useGetUserProjectsByType } from "@app/hooks/api/projects";
import { projectKeys } from "@app/hooks/api/projects/query-keys";
import { ProjectType } from "@app/hooks/api/projects/types";
import { useGetProjectFolders } from "@app/hooks/api/secretFolders/queries";
import { secretInsightsKeys, useGetSecretBlindIndexStatus } from "@app/hooks/api/secretInsights";
import {
  useCreateSecretValidationRule,
  useDeleteSecretValidationRule,
  useListSecretValidationRules,
  useUpdateSecretValidationRule
} from "@app/hooks/api/secretValidationRules";
import { useGetOrgSubscription } from "@app/hooks/api/subscriptions/queries";

import type { SecretPoliciesAdapter } from "./contract";

const BLIND_INDEX_SETTLED = ["completed", "failed", "not-found"];

export const secretPoliciesLive: SecretPoliciesAdapter = {
  useGates: (orgId) => {
    const { config } = useServerConfig();
    const org = useGetOrganizationById(orgId);
    const subscription = useGetOrgSubscription({ orgID: orgId });
    return {
      data:
        org.data && subscription.data
          ? {
              allowCrossProjectSecretSharing: Boolean(org.data.allowCrossProjectSecretSharing),
              crossProjectSecretSharingInPlan: Boolean(subscription.data.crossProjectSecretSharing),
              paramsFolderSecretDetectionEnabled: Boolean(config.paramsFolderSecretDetectionEnabled)
            }
          : undefined,
      isPending: org.isPending || subscription.isPending,
      error: org.error ?? subscription.error
    };
  },
  useValidationRules: (projectId, { enabled }) =>
    useListSecretValidationRules({ projectId }, { enabled }),
  useCreateValidationRule: useCreateSecretValidationRule,
  useUpdateValidationRule: useUpdateSecretValidationRule,
  useDeleteValidationRule: useDeleteSecretValidationRule,
  useBlindIndexStatus: (projectId, { enabled }) => {
    const queryClient = useQueryClient();
    const query = useGetSecretBlindIndexStatus(
      { projectId },
      {
        enabled,
        refetchInterval: (current) =>
          BLIND_INDEX_SETTLED.includes(current.state.data?.status ?? "") ? false : 2000
      }
    );
    const status = query.data?.status;
    useEffect(() => {
      if (enabled && status === "completed") {
        queryClient.invalidateQueries({ queryKey: projectKeys.getProjectById(projectId) });
      }
    }, [enabled, status, projectId, queryClient]);
    return query;
  },
  useEnableBlindIndex: () => {
    const queryClient = useQueryClient();
    const enable = useEnableSecretBlindIndex();
    return {
      isPending: enable.isPending,
      mutateAsync: async (dto) => {
        const result = await enable.mutateAsync(dto);
        await queryClient.invalidateQueries({
          queryKey: secretInsightsKeys.blindIndexStatus({ projectId: dto.projectId })
        });
        return result;
      }
    };
  },
  useFolderGrants: (projectId, { enabled }) => useListProjectFolderGrants(projectId, enabled),
  useFolderGrantsUsage: (grantIds, projectId, { enabled }) =>
    useGetProjectFolderGrantsUsageTotal(grantIds, projectId, enabled),
  useCreateFolderGrant: useCreateProjectFolderGrant,
  useDeleteFolderGrant: useDeleteProjectFolderGrant,
  useRevokeFolderGrants: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async ({
        grants,
        sourceProjectId
      }: {
        grants: TProjectFolderGrant[];
        sourceProjectId: string;
      }) => {
        await Promise.all(
          grants.map((grant) =>
            apiRequest
              .delete(`/api/v1/project-folder-grants/${grant.id}`, { params: { sourceProjectId } })
              .catch((error) => {
                if (axios.isAxiosError(error) && error.response?.status === 404) return;
                throw error;
              })
          )
        );
        await queryClient.invalidateQueries({
          queryKey: projectFolderGrantKeys.listByProject(sourceProjectId)
        });
        await queryClient.invalidateQueries({
          queryKey: projectFolderGrantKeys.listReceived(grants[0].targetProjectId)
        });
      }
    });
  },
  useFolders: ({ projectId, environment, path, enabled }) =>
    useGetProjectFolders({ projectId, environment, path, options: { enabled } }),
  useShareTargetProjects: () => useGetUserProjectsByType(ProjectType.SecretManager)
};
