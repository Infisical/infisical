import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { rolesBase } from "@app/hooks/api/certManagerAccess";

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

const invalidateAuditForProject = (
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string
) => {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      if (!Array.isArray(key) || key.length < 2) return false;
      if (key[1] !== "membership-permission-audit" && key[1] !== "identity-permission-audit")
        return false;
      const params = key[0] as { projectId?: string } | undefined;
      return params?.projectId === projectId;
    }
  });
};

export const useCreateProjectRole = () => {
  const queryClient = useQueryClient();

  return useMutation<TProjectRole, object, TCreateProjectRoleDTO>({
    mutationFn: async ({ projectId, projectType, ...dto }: TCreateProjectRoleDTO) => {
      const {
        data: { role }
      } = await apiRequest.post(rolesBase(projectType, projectId), dto);
      return role;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: roleQueryKeys.getProjectRoles(projectId) });
      invalidateAuditForProject(queryClient, projectId);
    }
  });
};

export const useUpdateProjectRole = () => {
  const queryClient = useQueryClient();

  return useMutation<TProjectRole, object, TUpdateProjectRoleDTO>({
    mutationFn: async ({ id, projectId, projectType, ...dto }: TUpdateProjectRoleDTO) => {
      const {
        data: { role }
      } = await apiRequest.patch(`${rolesBase(projectType, projectId)}/${id}`, dto);
      return role;
    },
    onSuccess: (_, { projectId, slug }) => {
      queryClient.invalidateQueries({ queryKey: roleQueryKeys.getProjectRoles(projectId) });
      if (slug) {
        queryClient.invalidateQueries({
          queryKey: roleQueryKeys.getProjectRoleBySlug(projectId, slug)
        });
      }
      invalidateAuditForProject(queryClient, projectId);
    }
  });
};

export const useDeleteProjectRole = () => {
  const queryClient = useQueryClient();
  return useMutation<TProjectRole, object, TDeleteProjectRoleDTO>({
    mutationFn: async ({ projectId, projectType, id }: TDeleteProjectRoleDTO) => {
      const {
        data: { role }
      } = await apiRequest.delete(`${rolesBase(projectType, projectId)}/${id}`);
      return role;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: roleQueryKeys.getProjectRoles(projectId) });
      invalidateAuditForProject(queryClient, projectId);
    }
  });
};

export const useCreateOrgRole = () => {
  const queryClient = useQueryClient();

  return useMutation<TOrgRole, object, TCreateOrgRoleDTO>({
    mutationFn: async ({ orgId, ...dto }: TCreateOrgRoleDTO) => {
      const {
        data: { role }
      } = await apiRequest.post("/api/v1/organization/roles", dto);

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
    mutationFn: async ({ id, orgId, ...dto }: TUpdateOrgRoleDTO) => {
      const {
        data: { role }
      } = await apiRequest.patch(`/api/v1/organization/roles/${id}`, dto);

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
      } = await apiRequest.delete(`/api/v1/organization/roles/${id}`, {
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
