import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { pamDomainKeys } from "./queries";
import { TCreatePamDomainDTO, TDeletePamDomainDTO, TPamDomain, TUpdatePamDomainDTO } from "./types";

export const useCreatePamDomain = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ domainType, ...body }: TCreatePamDomainDTO) => {
      const { data } = await apiRequest.post<{ domain: TPamDomain }>(
        `/api/v1/pam/domains/${domainType}`,
        body
      );
      return data.domain;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pamDomainKeys.domain() });
    }
  });
};

export const useUpdatePamDomain = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ domainType, domainId, ...body }: TUpdatePamDomainDTO) => {
      const { data } = await apiRequest.patch<{ domain: TPamDomain }>(
        `/api/v1/pam/domains/${domainType}/${domainId}`,
        body
      );
      return data.domain;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pamDomainKeys.domain() });
    }
  });
};

export const useDeletePamDomain = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ domainType, domainId }: TDeletePamDomainDTO) => {
      const { data } = await apiRequest.delete<{ domain: TPamDomain }>(
        `/api/v1/pam/domains/${domainType}/${domainId}`
      );
      return data.domain;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pamDomainKeys.domain() });
    }
  });
};
