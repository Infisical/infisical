import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { emailDomainKeys } from "./queries";
import {
  TCreateEmailDomainDTO,
  TDeleteEmailDomainDTO,
  TEmailDomain,
  TVerifyEmailDomainDTO
} from "./types";

export const useCreateEmailDomain = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ domain }: TCreateEmailDomainDTO) => {
      const { data } = await apiRequest.post<{ emailDomain: TEmailDomain }>(
        "/api/v1/email-domains",
        { domain }
      );
      return data.emailDomain;
    },
    onSuccess: ({ orgId }) => {
      queryClient.invalidateQueries({
        queryKey: emailDomainKeys.list(orgId)
      });
    }
  });
};

export const useVerifyEmailDomain = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ emailDomainId }: TVerifyEmailDomainDTO) => {
      const { data } = await apiRequest.post<{ emailDomain: TEmailDomain }>(
        `/api/v1/email-domains/${emailDomainId}/verify`
      );
      return data.emailDomain;
    },
    onSuccess: ({ orgId }) => {
      queryClient.invalidateQueries({
        queryKey: emailDomainKeys.list(orgId)
      });
    }
  });
};

export const useDeleteEmailDomain = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ emailDomainId }: TDeleteEmailDomainDTO) => {
      const { data } = await apiRequest.delete<{ emailDomain: TEmailDomain }>(
        `/api/v1/email-domains/${emailDomainId}`
      );
      return data.emailDomain;
    },
    onSuccess: ({ orgId }) => {
      queryClient.invalidateQueries({
        queryKey: emailDomainKeys.list(orgId)
      });
    }
  });
};
