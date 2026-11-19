import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { secretInsightsKeys } from "./queries";
import { TGetOrgSecretValueTrackingStatusResponse, TSearchSecretsByValueResponse } from "./types";

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
      // Shown as running straight away, so the previous run's failure does not flash back while
      // the status refetches.
      queryClient.setQueryData<TGetOrgSecretValueTrackingStatusResponse>(
        secretInsightsKeys.orgSecretValueTrackingStatus(orgId),
        (prev) => ({
          status: "pending",
          projectsTotal: prev?.projectsTotal ?? 0,
          projectsDone: 0,
          secretsProcessed: 0
        })
      );
      queryClient.invalidateQueries({
        queryKey: secretInsightsKeys.orgSecretValueTrackingStatus(orgId)
      });
    }
  });
};

// A mutation rather than a query so the value never becomes part of a cache key.
export const useSearchSecretsByValue = () =>
  useMutation<TSearchSecretsByValueResponse, object, { secretValue: string }>({
    mutationFn: async ({ secretValue }) => {
      const { data } = await apiRequest.post<TSearchSecretsByValueResponse>(
        "/api/v1/insights/secrets/search-by-value",
        { secretValue }
      );
      return data;
    }
  });
