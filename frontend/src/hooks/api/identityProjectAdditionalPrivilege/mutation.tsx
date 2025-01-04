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

  return useMutation<TIdentityProjectPrivilege, object, TCreateIdentityProjectPrivilegeDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post("/api/v2/identity-project-additional-privilege", dto);
      return data.privilege;
    },
    onSuccess: (_, { projectId, identityId }) => {
      queryClient.invalidateQueries({
        queryKey: identitiyProjectPrivilegeKeys.list({ projectId, identityId })
      });
    }
  });
};

export const useUpdateIdentityProjectAdditionalPrivilege = () => {
  const queryClient = useQueryClient();

  return useMutation<TIdentityProjectPrivilege, object, TUpdateIdentityProjectPrivlegeDTO>({
    mutationFn: async ({ projectId, privilegeId, identityId, permissions, slug, type }) => {
      const { data: res } = await apiRequest.patch(
        `/api/v2/identity-project-additional-privilege/${privilegeId}`,
        {
          privilegeId,
          projectId,
          identityId,
          permissions,
          slug,
          type
        }
      );
      return res.privilege;
    },
    onSuccess: (_, { projectId, identityId }) => {
      queryClient.invalidateQueries({
        queryKey: identitiyProjectPrivilegeKeys.list({ projectId, identityId })
      });
    }
  });
};

export const useDeleteIdentityProjectAdditionalPrivilege = () => {
  const queryClient = useQueryClient();

  return useMutation<TIdentityProjectPrivilege, object, TDeleteIdentityProjectPrivilegeDTO>({
    mutationFn: async ({ identityId, projectId, privilegeId }) => {
      const { data } = await apiRequest.delete(
        `/api/v2/identity-project-additional-privilege/${privilegeId}`,
        {
          data: {
            identityId,
            privilegeId,
            projectId
          }
        }
      );
      return data.privilege;
    },
    onSuccess: (_, { projectId, identityId }) => {
      queryClient.invalidateQueries({
        queryKey: identitiyProjectPrivilegeKeys.list({ projectId, identityId })
      });
    }
  });
};
