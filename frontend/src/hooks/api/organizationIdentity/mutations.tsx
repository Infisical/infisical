import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { organizationIdentityQuery } from "./queries";
import {
  TCreateOrganizationIdentityDTO,
  TDeleteOrganizationIdentityDTO,
  TOrganizationIdentity,
  TUpdateOrganizationIdentityDTO
} from "./types";

export const useCreateOrganizationIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: TCreateOrganizationIdentityDTO) => {
      const { data } = await apiRequest.post<{ identity: TOrganizationIdentity }>(
        "/api/v1/organization/identities",
        dto
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationIdentityQuery.allKey() });
    }
  });
};

export const useUpdateOrganizationIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ identityId, ...updates }: TUpdateOrganizationIdentityDTO) => {
      const { data } = await apiRequest.patch<{ identity: TOrganizationIdentity }>(
        `/api/v1/organization/identities/${identityId}`,
        updates
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationIdentityQuery.allKey() });
    }
  });
};

export const useDeleteOrganizationIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ identityId }: TDeleteOrganizationIdentityDTO) => {
      const { data } = await apiRequest.delete<{ identity: TOrganizationIdentity }>(
        `/api/v1/organization/identities/${identityId}`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationIdentityQuery.allKey() });
    }
  });
};
