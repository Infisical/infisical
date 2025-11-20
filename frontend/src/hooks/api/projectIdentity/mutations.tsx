import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { identitiesKeys, projectKeys } from "@app/hooks/api";
import { subscriptionQueryKeys } from "@app/hooks/api/subscriptions/queries";

import { projectIdentityQuery } from "./queries";
import {
  TCreateProjectIdentityDTO,
  TDeleteProjectIdentityDTO,
  TProjectIdentity,
  TUpdateProjectIdentityDTO
} from "./types";

export const useCreateProjectIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, ...dto }: TCreateProjectIdentityDTO) => {
      const { data } = await apiRequest.post<{ identity: TProjectIdentity }>(
        `/api/v1/projects/${projectId}/identities`,
        dto
      );
      return data.identity;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectIdentityQuery.allKey() });
      queryClient.invalidateQueries({
        queryKey: subscriptionQueryKeys.all()
      });
    }
  });
};

export const useUpdateProjectIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, identityId, ...updates }: TUpdateProjectIdentityDTO) => {
      const { data } = await apiRequest.patch<{ identity: TProjectIdentity }>(
        `/api/v1/projects/${projectId}/identities/${identityId}`,
        updates
      );
      return data.identity;
    },
    onSuccess: (_, { projectId, identityId }) => {
      queryClient.invalidateQueries({ queryKey: projectIdentityQuery.allKey() });
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectIdentityMembershipDetails(projectId, identityId)
      });
    }
  });
};

export const useDeleteProjectIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, identityId }: TDeleteProjectIdentityDTO) => {
      const { data } = await apiRequest.delete<{ identity: TProjectIdentity }>(
        `/api/v1/projects/${projectId}/identities/${identityId}`
      );
      return data.identity;
    },
    onSuccess: (_, { projectId, identityId }) => {
      queryClient.invalidateQueries({ queryKey: projectIdentityQuery.allKey() });
      queryClient.invalidateQueries({ queryKey: projectIdentityQuery.allKey() });
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectIdentityMemberships(projectId)
      });
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityProjectMemberships(identityId)
      });
      queryClient.invalidateQueries({
        queryKey: subscriptionQueryKeys.all()
      });
    }
  });
};
