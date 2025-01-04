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

  return useMutation<TProjectRole, {}, TCreateProjectRoleDTO>({
    mutationFn: async ({ projectId, ...dto }: TCreateProjectRoleDTO) => {
      const {
        data: { role }
      } = await apiRequest.post(`/api/v2/workspace/${projectId}/roles`, dto);
      return role;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries(roleQueryKeys.getProjectRoles(projectId));
    }
  });
};

export const useUpdateProjectRole = () => {
  const queryClient = useQueryClient();

  return useMutation<TProjectRole, {}, TUpdateProjectRoleDTO>({
    mutationFn: async ({ id, projectId, ...dto }: TUpdateProjectRoleDTO) => {
      const {
        data: { role }
      } = await apiRequest.patch(`/api/v2/workspace/${projectId}/roles/${id}`, dto);
      return role;
    },
    onSuccess: (_, { projectId, slug }) => {
      queryClient.invalidateQueries(roleQueryKeys.getProjectRoles(projectId));
      if (slug) {
        queryClient.invalidateQueries(roleQueryKeys.getProjectRoleBySlug(projectId, slug));
      }
    }
  });
};

export const useDeleteProjectRole = () => {
  const queryClient = useQueryClient();
  return useMutation<TProjectRole, {}, TDeleteProjectRoleDTO>({
    mutationFn: async ({ projectId, id }: TDeleteProjectRoleDTO) => {
      const {
        data: { role }
      } = await apiRequest.delete(`/api/v2/workspace/${projectId}/roles/${id}`);
      return role;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries(roleQueryKeys.getProjectRoles(projectId));
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
        permissions: permissions?.length ? packRules(permissions) : undefined
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
