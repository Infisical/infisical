import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { projectFolderGrantKeys } from "./queries";
import {
  TCreateProjectFolderGrantDTO,
  TDeleteProjectFolderGrantDTO,
  TProjectFolderGrant
} from "./types";

const invalidateTargetProjectSecrets = (
  queryClient: ReturnType<typeof useQueryClient>,
  targetProjectId: string
) => {
  queryClient.invalidateQueries({
    predicate: (query) =>
      (query.queryKey[0] as { projectId?: string })?.projectId === targetProjectId &&
      (query.queryKey[1] === "secrets" ||
        query.queryKey[1] === "secrets-import-sec" ||
        query.queryKey[1] === "imported-folders-all-envs")
  });
  queryClient.invalidateQueries({
    predicate: (query) =>
      Array.isArray(query.queryKey) &&
      query.queryKey[0] === "dashboard" &&
      (query.queryKey[1] as { projectId?: string })?.projectId === targetProjectId
  });
  queryClient.invalidateQueries({
    predicate: (query) =>
      Array.isArray(query.queryKey) &&
      (query.queryKey[0] === "secret-reference-tree" ||
        query.queryKey[0] === "secret-references") &&
      (query.queryKey[1] as { projectId?: string })?.projectId === targetProjectId
  });
};

export const useCreateProjectFolderGrant = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: TCreateProjectFolderGrantDTO) => {
      const { data } = await apiRequest.post<{ grant: TProjectFolderGrant }>(
        "/api/v1/project-folder-grants",
        dto
      );
      return data.grant;
    },
    onSuccess: (_, { sourceProjectId, targetProjectId }) => {
      queryClient.invalidateQueries({
        queryKey: projectFolderGrantKeys.listByProject(sourceProjectId)
      });
      queryClient.invalidateQueries({
        queryKey: projectFolderGrantKeys.listReceived(targetProjectId)
      });
      invalidateTargetProjectSecrets(queryClient, targetProjectId);
    }
  });
};

export const useDeleteProjectFolderGrant = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ grantId, sourceProjectId }: TDeleteProjectFolderGrantDTO) => {
      const { data } = await apiRequest.delete<{ grant: TProjectFolderGrant }>(
        `/api/v1/project-folder-grants/${grantId}`,
        { params: { sourceProjectId } }
      );
      return data.grant;
    },
    onSuccess: (grant, { sourceProjectId }) => {
      queryClient.invalidateQueries({
        queryKey: projectFolderGrantKeys.listByProject(sourceProjectId)
      });
      if (grant.targetProjectId) {
        queryClient.invalidateQueries({
          queryKey: projectFolderGrantKeys.listReceived(grant.targetProjectId)
        });
        invalidateTargetProjectSecrets(queryClient, grant.targetProjectId);
      }
    }
  });
};
