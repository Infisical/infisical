import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { organizationKeys } from "../organization/queries";
import { userKeys } from "../users/query-keys";
import { groupKeys } from "./queries";
import { TIdentityGroup } from "./types";

export const useCreateIdentityGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      name,
      slug,
      role
    }: {
      name: string;
      slug: string;
      organizationId: string;
      role?: string;
    }) => {
      const { data: group } = await apiRequest.post<TIdentityGroup>("/api/v1/identity-groups", {
        name,
        slug,
        role
      });

      return group;
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.getOrgGroups(organizationId) });
    }
  });
};