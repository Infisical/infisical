import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { identitiesKeys, projectKeys } from "@app/hooks/api";
import { identityMembershipsBase } from "@app/hooks/api/certManagerAccess";
import { pkiApplicationKeys } from "@app/hooks/api/pkiApplications/queries";
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
    mutationFn: async ({
      identityId,
      projectId,
      projectType,
      role
    }: TCreateProjectIdentityMembershipDTO) => {
      const {
        data: { identityMembership }
      } = await apiRequest.post<{ identityMembership: TProjectIdentityMembership }>(
        `${identityMembershipsBase(projectType, projectId)}/${identityId}`,
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
      queryClient.invalidateQueries({ queryKey: pkiApplicationKeys.all });
    }
  });
};

export const useUpdateProjectIdentityMembership = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      projectType,
      identityId,
      ...updates
    }: TUpdateProjectIdentityMembershipDTO) => {
      const {
        data: { identityMembership }
      } = await apiRequest.patch<{ identityMembership: TProjectIdentityMembership }>(
        `${identityMembershipsBase(projectType, projectId)}/${identityId}`,
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
    mutationFn: async ({
      identityId,
      projectId,
      projectType
    }: TDeleteProjectIdentityMembershipDTO) => {
      const {
        data: { identityMembership }
      } = await apiRequest.delete<{ identityMembership: TProjectIdentityMembership }>(
        `${identityMembershipsBase(projectType, projectId)}/${identityId}`
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
      queryClient.invalidateQueries({ queryKey: pkiApplicationKeys.all });
    }
  });
};
