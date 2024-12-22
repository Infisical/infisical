import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { GetUserSecretsResponse } from "./types";

export const userSecretsKeys = {
  all: () => ["userSecrets"] as const,
  lists: () => [...userSecretsKeys.all(), "list"] as const,
  list: (filters: { offset: number; limit: number; organizationId: string }) => 
    [...userSecretsKeys.lists(), filters] as const,
  details: () => [...userSecretsKeys.all(), "detail"] as const,
  detail: (id: string) => [...userSecretsKeys.details(), id] as const
};

export const useGetUserSecrets = ({
  organizationId,
  offset = 0,
  limit = 10
}: {
  organizationId: string;
  offset?: number;
  limit?: number;
}) => {
  return useQuery({
    queryKey: userSecretsKeys.list({ offset, limit, organizationId }),
    queryFn: async () => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(limit)
      });

      const { data } = await apiRequest.get<GetUserSecretsResponse>(
        `/api/v1/organizations/${organizationId}/user-secrets`,
        { params }
      );
      return data;
    },
    enabled: Boolean(organizationId)
  });
}; 