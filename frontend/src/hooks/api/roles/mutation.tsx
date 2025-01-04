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
  TProjectRole,
  TUpdateOrgRoleDTO,
  TUpdateProjectRoleDTO
} from "./types";

export const useCreateProjectRole = () => {
  const queryClient = useQueryClient();

  return useMutation<TProjectRole, object, TCreateProjectRoleDTO>({
    mutationFn: async ({ projectId, ...dto }: TCreateProjectRoleDTO) => {
      const {
        data: { role }
      } = await apiRequest.post(`/api/v2/workspace/${projectId}/roles`, dto);
      return role;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: roleQueryKeys.getProjectRoles(projectId) });
    }
  });
};

export const useUpdateProjectRole = () => {
  const queryClient = useQueryClient();

  return useMutation<TProjectRole, object, TUpdateProjectRoleDTO>({
    mutationFn: async ({ id, projectId, ...dto }: TUpdateProjectRoleDTO) => {
      const {
        data: { role }
      } = await apiRequest.patch(`/api/v2/workspace/${projectId}/roles/${id}`, dto);
      return role;
    },
    onSuccess: (_, { projectId, slug }) => {
      queryClient.invalidateQueries({ queryKey: roleQueryKeys.getProjectRoles(projectId) });
      if (slug) {
        queryClient.invalidateQueries({
          queryKey: roleQueryKeys.getProjectRoleBySlug(projectId, slug)
        });
      }
    }
  });
};

export const useDeleteProjectRole = () => {
  const queryClient = useQueryClient();
  return useMutation<TProjectRole, object, TDeleteProjectRoleDTO>({
    mutationFn: async ({ projectId, id }: TDeleteProjectRoleDTO) => {
      const {
        data: { role }
      } = await apiRequest.delete(`/api/v2/workspace/${projectId}/roles/${id}`);
      return role;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: roleQueryKeys.getProjectRoles(projectId) });
    }
  });
};

export const useCreateOrgRole = () => {
  const queryClient = useQueryClient();

  return useMutation<TOrgRole, object, TCreateOrgRoleDTO>({
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
      queryClient.invalidateQueries({ queryKey: roleQueryKeys.getOrgRoles(orgId) });
    }
  });
};

export const useUpdateOrgRole = () => {
  const queryClient = useQueryClient();

  return useMutation<TOrgRole, object, TUpdateOrgRoleDTO>({
    mutationFn: async ({ id, orgId, permissions, ...dto }: TUpdateOrgRoleDTO) => {
      const {
        data: { role }
      } = await apiRequest.patch(`/api/v1/organization/${orgId}/roles/${id}`, {
        ...dto,
        permissions: permissions?.length ? packRules(permissions) : undefined
      });

      return role;
    },
    onSuccess: (_, { id, orgId }) => {
      queryClient.invalidateQueries({ queryKey: roleQueryKeys.getOrgRoles(orgId) });
      queryClient.invalidateQueries({ queryKey: roleQueryKeys.getOrgRole(orgId, id) });
    }
  });
};

export const useDeleteOrgRole = () => {
  const queryClient = useQueryClient();

  return useMutation<TOrgRole, object, TDeleteOrgRoleDTO>({
    mutationFn: async ({ orgId, id }: TDeleteOrgRoleDTO) => {
      const {
        data: { role }
      } = await apiRequest.delete(`/api/v1/organization/${orgId}/roles/${id}`, {
        data: { orgId }
      });

      return role;
    },
    onSuccess: (_, { id, orgId }) => {
      queryClient.invalidateQueries({ queryKey: roleQueryKeys.getOrgRoles(orgId) });
      queryClient.invalidateQueries({ queryKey: roleQueryKeys.getOrgRole(orgId, id) });
    }
  });
};
