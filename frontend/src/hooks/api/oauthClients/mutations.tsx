import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { oauthClientKeys } from "./queries";
import {
  TCreateOauthClientDTO,
  TDeleteOauthClientDTO,
  TOauthClient,
  TOauthConsentDTO,
  TRotateOauthClientSecretDTO,
  TUpdateOauthClientDTO
} from "./types";

export const useCreateOauthClient = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: TCreateOauthClientDTO) => {
      const { data } = await apiRequest.post<{ client: TOauthClient; clientSecret: string }>(
        "/api/v1/oauth/clients",
        dto
      );
      return data;
    },
    onSuccess: ({ client }) => {
      queryClient.invalidateQueries({
        queryKey: oauthClientKeys.list(client.orgId)
      });
    }
  });
};

export const useUpdateOauthClient = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientDbId, ...dto }: TUpdateOauthClientDTO) => {
      const { data } = await apiRequest.patch<{ client: TOauthClient }>(
        `/api/v1/oauth/clients/${clientDbId}`,
        dto
      );
      return data.client;
    },
    onSuccess: ({ orgId }) => {
      queryClient.invalidateQueries({
        queryKey: oauthClientKeys.list(orgId)
      });
    }
  });
};

export const useDeleteOauthClient = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientDbId }: TDeleteOauthClientDTO) => {
      const { data } = await apiRequest.delete<{ client: TOauthClient }>(
        `/api/v1/oauth/clients/${clientDbId}`
      );
      return data.client;
    },
    onSuccess: ({ orgId }) => {
      queryClient.invalidateQueries({
        queryKey: oauthClientKeys.list(orgId)
      });
    }
  });
};

export const useRotateOauthClientSecret = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientDbId }: TRotateOauthClientSecretDTO) => {
      const { data } = await apiRequest.post<{ client: TOauthClient; clientSecret: string }>(
        `/api/v1/oauth/clients/${clientDbId}/rotate-secret`
      );
      return data;
    },
    onSuccess: ({ client }) => {
      queryClient.invalidateQueries({
        queryKey: oauthClientKeys.list(client.orgId)
      });
    }
  });
};

export const useOauthConsent = () => {
  return useMutation({
    mutationFn: async (dto: TOauthConsentDTO) => {
      const { data } = await apiRequest.post<{ callbackUrl: string }>(
        "/api/v1/oauth/authorize/consent",
        {
          client_id: dto.clientId,
          redirect_uri: dto.redirectUri,
          state: dto.state,
          code_challenge: dto.codeChallenge,
          code_challenge_method: dto.codeChallengeMethod,
          scope: dto.scope
        }
      );
      return data;
    }
  });
};
