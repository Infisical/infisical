import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { type GetUserSecretsResponse } from "./types";

export const useGetUserSecrets = ({ userId }: { userId?: string }) => {
  return useQuery({
    enabled: Boolean(userId),
    queryKey: ["user-secrets", userId],
    queryFn: async () => {
      const { data } = await apiRequest.get<GetUserSecretsResponse>("api/v1/user-secrets", {
        params: {
          userId
        }
      });

      return data;
    }
  });
};
