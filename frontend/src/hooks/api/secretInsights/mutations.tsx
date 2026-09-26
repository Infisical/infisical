import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { fetchOrgSecretsDuplication, secretInsightsKeys } from "./queries";
import { TSearchSecretsByValueResponse } from "./types";

export const useEnableOrgSecretValueTracking = () => {
  const queryClient = useQueryClient();
  return useMutation<{ message: string }, object, { orgId: string }>({
    mutationFn: async () => {
      const { data } = await apiRequest.post<{ message: string }>(
        "/api/v1/organization/secret-value-tracking"
      );
      return data;
    },
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({
        queryKey: secretInsightsKeys.orgSecretValueTrackingStatus(orgId)
      });
    }
  });
};

// Recomputes on the server rather than refetching, since a plain refetch answers from the
// server's cache and would report the same stale result.
export const useRefreshOrgSecretsDuplication = () => {
  const queryClient = useQueryClient();
  return useMutation<unknown, object, { orgId: string }>({
    mutationFn: async ({ orgId }) => {
      const data = await fetchOrgSecretsDuplication(true);
      queryClient.setQueryData(secretInsightsKeys.orgSecretsDuplication(orgId), data);
      return data;
    }
  });
};

// A mutation rather than a query so the value never becomes part of a cache key.
export const useSearchSecretsByValue = () =>
  useMutation<TSearchSecretsByValueResponse, object, { secretValue: string }>({
    mutationFn: async ({ secretValue }) => {
      const { data } = await apiRequest.post<TSearchSecretsByValueResponse>(
        "/api/v4/secrets/search-by-value",
        { secretValue, scope: "organization" }
      );
      return data;
    }
  });
