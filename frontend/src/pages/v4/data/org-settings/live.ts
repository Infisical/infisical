import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import {
  certManagerInstanceKeys,
  type TCertManagerLegacyInstancesResponse,
  useExportCertManagerProject,
  useSetCertManagerActiveProject
} from "@app/hooks/api/certManagerInstance";
import {
  useAddExternalKms,
  useExternalKmsFetchGcpKeys,
  useRemoveExternalKms,
  useUpdateExternalKms
} from "@app/hooks/api/kms/mutations";
import { useGetExternalKmsById, useGetExternalKmsList } from "@app/hooks/api/kms/queries";
import { ExternalKmsProvider, KmsGcpKeyFetchAuthType } from "@app/hooks/api/kms/types";
import { useDeleteWorkspace } from "@app/hooks/api/projects/queries";
import {
  subOrganizationsQuery,
  useCreateSubOrganization,
  useDeleteSubOrganization,
  useJoinSubOrganization,
  useUpdateSubOrganization
} from "@app/hooks/api/subOrganizations";
import { useGetOrgSubscription } from "@app/hooks/api/subscriptions/queries";
import { useCreateMicrosoftTeamsIntegration } from "@app/hooks/api/workflowIntegrations/mutation";

import { useOrgId } from "../../access/permissions";
import type { OrgSettingsAdapter } from "./contract";

export const orgSettingsLive: OrgSettingsAdapter = {
  useEntitlements: (orgId) => useGetOrgSubscription({ orgID: orgId }),

  useExternalKmsList: (orgId) => useGetExternalKmsList(orgId),
  useExternalKms: useGetExternalKmsById,
  useAddExternalKms: () => useAddExternalKms(useOrgId()),
  useUpdateExternalKms: () => {
    const orgId = useOrgId();
    const aws = useUpdateExternalKms(orgId, ExternalKmsProvider.Aws);
    const gcp = useUpdateExternalKms(orgId, ExternalKmsProvider.Gcp);
    return {
      mutateAsync: ({ provider, ...dto }) =>
        (provider === ExternalKmsProvider.Aws ? aws : gcp).mutateAsync(dto),
      isPending: aws.isPending || gcp.isPending
    };
  },
  useRemoveExternalKms: () => useRemoveExternalKms(useOrgId()),
  useFetchGcpKeys: () => useExternalKmsFetchGcpKeys(useOrgId()),
  useSavedGcpKeys: (params) =>
    useQuery({
      queryKey: ["external-kms-gcp-keys", params],
      queryFn: async () => {
        const { data } = await apiRequest.post<{ keys: string[] }>(
          "/api/v1/external-kms/gcp/keys",
          {
            authMethod: KmsGcpKeyFetchAuthType.Kms,
            region: params?.gcpRegion,
            kmsId: params?.kmsId
          }
        );
        return data;
      },
      enabled: Boolean(params),
      gcTime: 0
    }),

  useSubOrganizations: (params) => useQuery(subOrganizationsQuery.list(params)),
  useCreateSubOrganization,
  useUpdateSubOrganization,
  useDeleteSubOrganization,
  useJoinSubOrganization,

  useCertManagerLegacyInstances: (orgId) =>
    useQuery({
      queryKey: certManagerInstanceKeys.legacy(orgId),
      queryFn: async () => {
        const { data } = await apiRequest.get<TCertManagerLegacyInstancesResponse>(
          "/api/v1/cert-manager/instance/legacy"
        );
        return data;
      },
      enabled: Boolean(orgId)
    }),
  useSetCertManagerActiveProject,
  useExportCertManagerProject,
  useDeleteCertManagerProject: () => {
    const queryClient = useQueryClient();
    const deleteProject = useDeleteWorkspace();
    return useMutation({
      mutationFn: async ({ projectId }: { projectId: string }) => {
        await deleteProject.mutateAsync({ projectID: projectId });
        await queryClient.invalidateQueries({ queryKey: certManagerInstanceKeys.all });
      }
    });
  },

  useCreateMicrosoftTeamsIntegration
};
