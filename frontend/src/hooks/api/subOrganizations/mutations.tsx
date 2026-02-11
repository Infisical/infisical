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
        dto
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
    mutationFn: async ({ subOrgId, name, slug }: TUpdateSubOrganizationDTO) => {
      const { data } = await apiRequest.patch<{ organization: TSubOrganization }>(
        `/api/v1/sub-organizations/${subOrgId}`,
        { name, slug }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subOrganizationsQuery.allKey() });
    }
  });
};
