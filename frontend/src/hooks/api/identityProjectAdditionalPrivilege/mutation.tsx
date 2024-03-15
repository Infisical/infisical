import { packRules } from "@casl/ability/extra";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { workspaceKeys } from "../workspace/queries";
import {
  TCreateIdentityProjectPrivilegeDTO,
  TDeleteIdentityProjectPrivilegeDTO,
  TIdentityProjectPrivilege,
  TUpdateIdentityProjectPrivlegeDTO
} from "./types";

export const useCreateIdentityProjectAdditionalPrivilege = () => {
  const queryClient = useQueryClient();

  return useMutation<
    { privilege: TIdentityProjectPrivilege },
    {},
    TCreateIdentityProjectPrivilegeDTO
  >({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post("/api/v1/additional-privilege/identity", {
        ...dto,
        permissions: packRules(dto.permissions)
      });
      return data.privilege;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceIdentityMemberships(projectId));
    }
  });
};

export const useUpdateIdentityProjectAdditionalPrivilege = () => {
  const queryClient = useQueryClient();

  return useMutation<
    { privilege: TIdentityProjectPrivilege },
    {},
    TUpdateIdentityProjectPrivlegeDTO
  >({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.patch(
        `/api/v1/additional-privilege/identity/${dto.privilegeId}`,
        { ...dto, permissions: dto.permissions ? packRules(dto.permissions) : undefined }
      );
      return data.privilege;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceIdentityMemberships(projectId));
    }
  });
};

export const useDeleteIdentityProjectAdditionalPrivilege = () => {
  const queryClient = useQueryClient();

  return useMutation<
    { privilege: TIdentityProjectPrivilege },
    {},
    TDeleteIdentityProjectPrivilegeDTO
  >({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.delete(
        `/api/v1/additional-privilege/identity/${dto.privilegeId}`
      );
      return data.privilege;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceIdentityMemberships(projectId));
    }
  });
};
