import { useMutation } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { IntegrationAuth, TDuplicateIntegrationAuthDTO } from "./types";

// For now, this should only be used in the Github app integration flow.
export const useDuplicateIntegrationAuth = () => {
  return useMutation<IntegrationAuth, object, TDuplicateIntegrationAuthDTO>({
    mutationFn: async (body) => {
      const { data } = await apiRequest.post<{ integrationAuth: IntegrationAuth }>(
        `/api/v1/integration-auth/${body.integrationAuthId}/duplicate`,
        body
      );

      return data.integrationAuth;
    }
  });
};
