import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { projectUserPrivilegeKeys } from "./queries";
import {
  TCreateProjectUserPrivilegeDTO,
  TDeleteProjectUserPrivilegeDTO,
  TProjectUserPrivilege,
  TUpdateProjectUserPrivlegeDTO
} from "./types";

export const useCreateProjectUserAdditionalPrivilege = () => {
  const queryClient = useQueryClient();

  return useMutation<{ privilege: TProjectUserPrivilege }, object, TCreateProjectUserPrivilegeDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post("/api/v1/user-project-additional-privilege", dto);
      return data.privilege;
    },
    onSuccess: (_, { projectMembershipId }) => {
      queryClient.invalidateQueries({
        queryKey: projectUserPrivilegeKeys.list(projectMembershipId)
      });
    }
  });
};

export const useUpdateProjectUserAdditionalPrivilege = () => {
  const queryClient = useQueryClient();

  return useMutation<{ privilege: TProjectUserPrivilege }, object, TUpdateProjectUserPrivlegeDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.patch(
        `/api/v1/user-project-additional-privilege/${dto.privilegeId}`,
        dto
      );
      return data.privilege;
    },
    onSuccess: (_, { projectMembershipId }) => {
      queryClient.invalidateQueries({
        queryKey: projectUserPrivilegeKeys.list(projectMembershipId)
      });
    }
  });
};

export const useDeleteProjectUserAdditionalPrivilege = () => {
  const queryClient = useQueryClient();

  return useMutation<{ privilege: TProjectUserPrivilege }, object, TDeleteProjectUserPrivilegeDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.delete(
        `/api/v1/user-project-additional-privilege/${dto.privilegeId}`
      );
      return data.privilege;
    },
    onSuccess: (_, { projectMembershipId }) => {
      queryClient.invalidateQueries({
        queryKey: projectUserPrivilegeKeys.list(projectMembershipId)
      });
    }
  });
};
