import { packRules } from "@casl/ability/extra";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { identitiyProjectPrivilegeKeys } from "./queries";
import {
  TCreateIdentityProjectPrivilegeDTO,
  TDeleteIdentityProjectPrivilegeDTO,
  TIdentityProjectPrivilege,
  TUpdateIdentityProjectPrivlegeDTO
} from "./types";

export const useCreateIdentityProjectAdditionalPrivilege = () => {
  const queryClient = useQueryClient();

  return useMutation<TIdentityProjectPrivilege, {}, TCreateIdentityProjectPrivilegeDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post("/api/v1/additional-privilege/identity", {
        ...dto,
        isPackedPermission: true,
        permissions: packRules(dto.permissions)
      });
      return data.privilege;
    },
    onSuccess: (_, { projectSlug, identityId }) => {
      queryClient.invalidateQueries(
        identitiyProjectPrivilegeKeys.list({ projectSlug, identityId })
      );
    }
  });
};

export const useUpdateIdentityProjectAdditionalPrivilege = () => {
  const queryClient = useQueryClient();

  return useMutation<TIdentityProjectPrivilege, {}, TUpdateIdentityProjectPrivlegeDTO>({
    mutationFn: async ({ privilegeSlug, projectSlug, identityId, data }) => {
      const { data: res } = await apiRequest.patch("/api/v1/additional-privilege/identity", {
        privilegeSlug,
        projectSlug,
        identityId,
        data: {
          isPackedPermission: true,
          ...data,
          permissions: data.permissions ? packRules(data.permissions) : undefined
        }
      });
      return res.privilege;
    },
    onSuccess: (_, { projectSlug, identityId }) => {
      queryClient.invalidateQueries(
        identitiyProjectPrivilegeKeys.list({ projectSlug, identityId })
      );
    }
  });
};

export const useDeleteIdentityProjectAdditionalPrivilege = () => {
  const queryClient = useQueryClient();

  return useMutation<TIdentityProjectPrivilege, {}, TDeleteIdentityProjectPrivilegeDTO>({
    mutationFn: async ({ identityId, projectSlug, privilegeSlug }) => {
      const { data } = await apiRequest.delete("/api/v1/additional-privilege/identity", {
        data: {
          identityId,
          projectSlug,
          privilegeSlug
        }
      });
      return data.privilege;
    },
    onSuccess: (_, { projectSlug, identityId }) => {
      queryClient.invalidateQueries(
        identitiyProjectPrivilegeKeys.list({ projectSlug, identityId })
      );
    }
  });
};
