import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { subOrganizationsQuery } from "./queries";
import {
  TCreateSubOrganizationDTO,
  TDeleteSubOrganizationDTO,
  TJoinSubOrganizationDTO,
  TSubOrganization,
  TUpdateSubOrganizationDTO
} from "./types";

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

export const useDeleteSubOrganization = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ subOrgId }: TDeleteSubOrganizationDTO) => {
      const { data } = await apiRequest.delete<{ organization: TSubOrganization }>(
        `/api/v1/sub-organizations/${subOrgId}`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subOrganizationsQuery.allKey() });
    }
  });
};

export const useJoinSubOrganization = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ subOrgId }: TJoinSubOrganizationDTO) => {
      const { data } = await apiRequest.post<{ organization: TSubOrganization }>(
        `/api/v1/sub-organizations/${subOrgId}/memberships`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subOrganizationsQuery.allKey() });
    }
  });
};
