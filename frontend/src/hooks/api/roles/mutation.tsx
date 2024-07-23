import { packRules } from "@casl/ability/extra";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { roleQueryKeys } from "./queries";
import {
  TCreateOrgRoleDTO,
  TCreateProjectRoleDTO,
  TDeleteOrgRoleDTO,
  TDeleteProjectRoleDTO,
  TOrgRole,
  TUpdateOrgRoleDTO,
  TUpdateProjectRoleDTO
} from "./types";

export const useCreateProjectRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectSlug, ...dto }: TCreateProjectRoleDTO) =>
      apiRequest.post(`/api/v1/workspace/${projectSlug}/roles`, dto),
    onSuccess: (_, { projectSlug }) => {
      queryClient.invalidateQueries(roleQueryKeys.getProjectRoles(projectSlug));
    }
  });
};

export const useUpdateProjectRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, projectSlug, ...dto }: TUpdateProjectRoleDTO) =>
      apiRequest.patch(`/api/v1/workspace/${projectSlug}/roles/${id}`, dto),
    onSuccess: (_, { projectSlug }) => {
      queryClient.invalidateQueries(roleQueryKeys.getProjectRoles(projectSlug));
    }
  });
};

export const useDeleteProjectRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectSlug, id }: TDeleteProjectRoleDTO) =>
      apiRequest.delete(`/api/v1/workspace/${projectSlug}/roles/${id}`),
    onSuccess: (_, { projectSlug }) => {
      queryClient.invalidateQueries(roleQueryKeys.getProjectRoles(projectSlug));
    }
  });
};

export const useCreateOrgRole = () => {
  const queryClient = useQueryClient();

  return useMutation<TOrgRole, {}, TCreateOrgRoleDTO>({
    mutationFn: async ({ orgId, permissions, ...dto }: TCreateOrgRoleDTO) => {
      const {
        data: { role }
      } = await apiRequest.post(`/api/v1/organization/${orgId}/roles`, {
        ...dto,
        permissions: permissions.length ? packRules(permissions) : []
      });

      return role;
    },
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries(roleQueryKeys.getOrgRoles(orgId));
    }
  });
};

export const useUpdateOrgRole = () => {
  const queryClient = useQueryClient();

  return useMutation<TOrgRole, {}, TUpdateOrgRoleDTO>({
    mutationFn: async ({ id, orgId, permissions, ...dto }: TUpdateOrgRoleDTO) => {
      const {
        data: { role }
      } = await apiRequest.patch(`/api/v1/organization/${orgId}/roles/${id}`, {
        ...dto,
        permissions: permissions?.length ? packRules(permissions) : []
      });

      return role;
    },
    onSuccess: (_, { id, orgId }) => {
      queryClient.invalidateQueries(roleQueryKeys.getOrgRoles(orgId));
      queryClient.invalidateQueries(roleQueryKeys.getOrgRole(orgId, id));
    }
  });
};

export const useDeleteOrgRole = () => {
  const queryClient = useQueryClient();

  return useMutation<TOrgRole, {}, TDeleteOrgRoleDTO>({
    mutationFn: async ({ orgId, id }: TDeleteOrgRoleDTO) => {
      const {
        data: { role }
      } = await apiRequest.delete(`/api/v1/organization/${orgId}/roles/${id}`, {
        data: { orgId }
      });

      return role;
    },
    onSuccess: (_, { id, orgId }) => {
      queryClient.invalidateQueries(roleQueryKeys.getOrgRoles(orgId));
      queryClient.invalidateQueries(roleQueryKeys.getOrgRole(orgId, id));
    }
  });
};
