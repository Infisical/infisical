import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TSharedSecret, TViewSharedSecretResponse } from "./types";

export const useGetSharedSecrets = (workspaceId: string) => {
  return useQuery({
    queryKey: ["sharedSecrets"],
    queryFn: async () => {
      const { data } = await apiRequest.get<TSharedSecret[]>(
        `/api/v1/secret-sharing/${workspaceId}`
      );
      return data;
    }
  });
};

export const useGetActiveSharedSecretById = (id: string) => {
  return useQuery<TViewSharedSecretResponse, [string]>({
    queryFn: async () => {
      const { data } = await apiRequest.get<TViewSharedSecretResponse>(
        `/api/v1/secret-sharing/public/${id}`
      );
      return {
        name: data.name,
        signedValue: data.signedValue,
        expiresAt: data.expiresAt
      };
    }
  });
};
