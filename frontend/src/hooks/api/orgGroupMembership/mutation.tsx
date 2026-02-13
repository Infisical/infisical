import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { organizationKeys } from "../organization/queries";
import {
  TCreateOrgGroupMembershipDTO,
  TDeleteOrgGroupMembershipDTO,
  TOrgGroupMembership
} from "./types";

export const useCreateOrgGroupMembership = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, roles }: TCreateOrgGroupMembershipDTO) => {
      const { data } = await apiRequest.post<{ groupMembership: TOrgGroupMembership }>(
        `/api/v1/organizations/memberships/groups/${groupId}`,
        { roles }
      );
      return data.groupMembership;
    },
    onSuccess: (_, { organizationId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({ queryKey: organizationKeys.getOrgGroups(organizationId) });
      } else {
        queryClient.invalidateQueries({
          predicate: (query) => query.queryKey[1] === "organization-groups"
        });
      }
    }
  });
};

export const useDeleteOrgGroupMembership = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId }: TDeleteOrgGroupMembershipDTO) => {
      const { data } = await apiRequest.delete<{ groupMembership: TOrgGroupMembership }>(
        `/api/v1/organizations/memberships/groups/${groupId}`
      );
      return data.groupMembership;
    },
    onSuccess: (_, { organizationId }) => {
      if (organizationId) {
        queryClient.invalidateQueries({ queryKey: organizationKeys.getOrgGroups(organizationId) });
      } else {
        queryClient.invalidateQueries({
          predicate: (query) => query.queryKey[1] === "organization-groups"
        });
      }
    }
  });
};
