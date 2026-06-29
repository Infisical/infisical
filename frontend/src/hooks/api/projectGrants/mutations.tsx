import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { projectGrantKeys } from "./queries";
import { TCreateProjectGrantDTO, TDeleteProjectGrantDTO, TProjectGrant } from "./types";

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

export const useCreateProjectGrant = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: TCreateProjectGrantDTO) => {
      const { data } = await apiRequest.post<{ grant: TProjectGrant }>(
        "/api/v1/project-grants",
        dto
      );
      return data.grant;
    },
    onSuccess: (_, { sourceProjectId, targetProjectId }) => {
      queryClient.invalidateQueries({
        queryKey: projectGrantKeys.listByProject(sourceProjectId)
      });
      queryClient.invalidateQueries({
        queryKey: projectGrantKeys.listReceived(targetProjectId)
      });
      invalidateTargetProjectSecrets(queryClient, targetProjectId);
    }
  });
};

export const useDeleteProjectGrant = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ grantId, sourceProjectId }: TDeleteProjectGrantDTO) => {
      const { data } = await apiRequest.delete<{ grant: TProjectGrant }>(
        `/api/v1/project-grants/${grantId}`,
        { params: { sourceProjectId } }
      );
      return data.grant;
    },
    onSuccess: (grant, { sourceProjectId }) => {
      queryClient.invalidateQueries({
        queryKey: projectGrantKeys.listByProject(sourceProjectId)
      });
      if (grant.targetProjectId) {
        queryClient.invalidateQueries({
          queryKey: projectGrantKeys.listReceived(grant.targetProjectId)
        });
        invalidateTargetProjectSecrets(queryClient, grant.targetProjectId);
      }
    }
  });
};
