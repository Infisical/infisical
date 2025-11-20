import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { identitiesKeys, projectKeys } from "@app/hooks/api";
import { projectIdentityQuery } from "@app/hooks/api/projectIdentity";

import {
  TCreateProjectIdentityMembershipDTO,
  TDeleteProjectIdentityMembershipDTO,
  TProjectIdentityMembership,
  TUpdateProjectIdentityMembershipDTO
} from "./types";

export const useCreateProjectIdentityMembership = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ identityId, projectId, role }: TCreateProjectIdentityMembershipDTO) => {
      const {
        data: { identityMembership }
      } = await apiRequest.post<{ identityMembership: TProjectIdentityMembership }>(
        `/api/v1/projects/${projectId}/memberships/identities/${identityId}`,
        {
          role
        }
      );

      return identityMembership;
    },
    onSuccess: (_, { identityId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectIdentityQuery.allKey() });
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectIdentityMemberships(projectId)
      });
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityProjectMemberships(identityId)
      });
    }
  });
};

export const useUpdateProjectIdentityMembership = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      identityId,
      ...updates
    }: TUpdateProjectIdentityMembershipDTO) => {
      const {
        data: { identityMembership }
      } = await apiRequest.patch<{ identityMembership: TProjectIdentityMembership }>(
        `/api/v1/projects/${projectId}/memberships/identities/${identityId}`,
        updates
      );
      return identityMembership;
    },
    onSuccess: (_, { projectId, identityId }) => {
      queryClient.invalidateQueries({ queryKey: projectIdentityQuery.allKey() });
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectIdentityMemberships(projectId)
      });
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityProjectMemberships(identityId)
      });
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectIdentityMembershipDetails(projectId, identityId)
      });
    }
  });
};

export const useDeleteProjectIdentityMembership = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ identityId, projectId }: TDeleteProjectIdentityMembershipDTO) => {
      const {
        data: { identityMembership }
      } = await apiRequest.delete<{ identityMembership: TProjectIdentityMembership }>(
        `/api/v1/projects/${projectId}/memberships/identities/${identityId}`
      );
      return identityMembership;
    },
    onSuccess: (_, { identityId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectIdentityQuery.allKey() });
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectIdentityMemberships(projectId)
      });
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityProjectMemberships(identityId)
      });
    }
  });
};
