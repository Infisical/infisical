import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { projectIdentityQuery } from "./queries";
import {
  TCreateProjectIdentityDTO,
  TDeleteProjectIdentityDTO,
  TProjectIdentity,
  TUpdateProjectIdentityDTO
} from "./types";

export const useCreateProjectIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, ...dto }: TCreateProjectIdentityDTO) => {
      const { data } = await apiRequest.post<{ identity: TProjectIdentity }>(
        `/api/v1/projects/${projectId}/identities`,
        dto
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectIdentityQuery.allKey() });
    }
  });
};

export const useUpdateProjectIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, identityId, ...updates }: TUpdateProjectIdentityDTO) => {
      const { data } = await apiRequest.patch<{ identity: TProjectIdentity }>(
        `/api/v1/projects/${projectId}/identities/${identityId}`,
        updates
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectIdentityQuery.allKey() });
    }
  });
};

export const useDeleteProjectIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, identityId }: TDeleteProjectIdentityDTO) => {
      const { data } = await apiRequest.delete<{ identity: TProjectIdentity }>(
        `/api/v1/projects/${projectId}/identities/${identityId}`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectIdentityQuery.allKey() });
    }
  });
};
