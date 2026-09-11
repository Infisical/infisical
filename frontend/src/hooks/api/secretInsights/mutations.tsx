import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { secretInsightsKeys } from "./queries";
import { TStartOrgBlindIndexMigrationResponse } from "./types";

export const useStartOrgBlindIndexMigration = () => {
  const queryClient = useQueryClient();
  // The endpoint resolves the org from the auth token and takes no body; orgId is carried only so
  // the success handler can key the invalidation.
  return useMutation<TStartOrgBlindIndexMigrationResponse, object, { orgId: string }>({
    mutationFn: async () => {
      const { data } = await apiRequest.post<{
        secretBlindIndexMigration: TStartOrgBlindIndexMigrationResponse;
      }>("/api/v1/insights/secrets/enable-blind-index");
      return data.secretBlindIndexMigration;
    },
    onSuccess: (_, { orgId }) =>
      queryClient.invalidateQueries({
        queryKey: secretInsightsKeys.orgBlindIndexMigration(orgId)
      })
  });
};
