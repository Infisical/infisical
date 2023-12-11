import { packRules } from "@casl/ability/extra";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { roleQueryKeys } from "./queries";
import {
  TCreateOrgRoleDTO,
  TCreateRoleDTO,
  TDeleteOrgRoleDTO,
  TDeleteRoleDTO,
  TUpdateOrgRoleDTO,
  TUpdateRoleDTO
} from "./types";

export const useCreateRole = <T extends string | undefined>() => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: TCreateRoleDTO<T>) => apiRequest.post("/api/v1/roles", dto),
    onSuccess: (_, { orgId, workspaceId }) => {
      queryClient.invalidateQueries(roleQueryKeys.getRoles({ orgId, workspaceId }));
    }
  });
};

export const useUpdateRole = <T extends string | undefined>() => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...dto }: TUpdateRoleDTO<T>) => apiRequest.patch(`/api/v1/roles/${id}`, dto),
    onSuccess: (_, { orgId, workspaceId }) => {
      queryClient.invalidateQueries(roleQueryKeys.getRoles({ orgId, workspaceId }));
    }
  });
};

export const useDeleteRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, id }: TDeleteRoleDTO) =>
      apiRequest.delete(`/api/v1/roles/${id}`, {
        data: { orgId }
      }),
    onSuccess: (_, { orgId, workspaceId }) => {
      queryClient.invalidateQueries(roleQueryKeys.getRoles({ orgId, workspaceId }));
    }
  });
};

export const useCreateOrgRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, permissions, ...dto }: TCreateOrgRoleDTO) =>
      apiRequest.post(`/api/ee/v1/organization/${orgId}/roles`, {
        ...dto,
        permissions: permissions.length ? packRules(permissions) : []
      }),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries(roleQueryKeys.getOrgRoles(orgId));
    }
  });
};

export const useUpdateOrgRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, orgId, permissions, ...dto }: TUpdateOrgRoleDTO) =>
      apiRequest.patch(`/api/ee/v1/organization/${orgId}/roles/${id}`, {
        ...dto,
        permissions: permissions?.length ? packRules(permissions) : undefined
      }),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries(roleQueryKeys.getOrgRoles(orgId));
    }
  });
};

export const useDeleteOrgRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, id }: TDeleteOrgRoleDTO) =>
      apiRequest.delete(`/api/ee/v1/organization/${orgId}/roles/${id}`, {
        data: { orgId }
      }),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries(roleQueryKeys.getOrgRoles(orgId));
    }
  });
};
