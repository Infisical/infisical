import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { projectUserPrivilegeKeys } from "./queries";
import {
  TCreateProjectUserPrivilegeDTO,
  TDeleteProjectUserPrivilegeDTO,
  TProjectUserPrivilege,
  TUpdateProjectUserPrivlegeDTO
} from "./types";

const invalidateAuditForMembership = (
  queryClient: ReturnType<typeof useQueryClient>,
  projectMembershipId: string
) => {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      if (!Array.isArray(key) || key.length < 2) return false;
      if (key[1] !== "membership-permission-audit") return false;
      const params = key[0] as { membershipId?: string } | undefined;
      return params?.membershipId === projectMembershipId;
    }
  });
};

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
      queryClient.invalidateQueries({ queryKey: ["secret-access-list"] });
      invalidateAuditForMembership(queryClient, projectMembershipId);
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
      queryClient.invalidateQueries({ queryKey: ["secret-access-list"] });
      invalidateAuditForMembership(queryClient, projectMembershipId);
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
      queryClient.invalidateQueries({ queryKey: ["secret-access-list"] });
      invalidateAuditForMembership(queryClient, projectMembershipId);
    }
  });
};
