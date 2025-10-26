import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { subOrganizationsQuery } from "./queries";
import { TCreateSubOrganizationDTO, TSubOrganization, TUpdateSubOrganizationDTO } from "./types";

export const useCreateSubOrganization = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: TCreateSubOrganizationDTO) => {
      const { data } = await apiRequest.post<{ organization: TSubOrganization }>(
        "/api/v1/sub-organizations",
        dto,
        {
          headers: { "x-root-org": "discard" } // akhi/scott: this just tells the request to use the root org ID header
        }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subOrganizationsQuery.allKey() });
    }
  });
};

export const useUpdateSubOrganization = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ subOrgId, name }: TUpdateSubOrganizationDTO) => {
      const { data } = await apiRequest.patch<{ organization: TSubOrganization }>(
        `/api/v1/sub-organizations/${subOrgId}`,
        { name }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subOrganizationsQuery.allKey() });
    }
  });
};
