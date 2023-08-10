import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { workspaceKeys } from "../workspace/queries";
import { TCloudIntegration } from "./types";

export const integrationQueryKeys = {
  getIntegrations: () => ["integrations"] as const
};

const fetchIntegrations = async () => {
  const { data } = await apiRequest.get<{ integrationOptions: TCloudIntegration[] }>(
    "/api/v1/integration-auth/integration-options"
  );

  return data.integrationOptions;
};

export const useGetCloudIntegrations = () =>
  useQuery({
    queryKey: integrationQueryKeys.getIntegrations(),
    queryFn: () => fetchIntegrations()
  });

export const useDeleteIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, { id: string; workspaceId: string }>({
    mutationFn: ({ id }) => apiRequest.delete(`/api/v1/integration/${id}`),
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceIntegrations(workspaceId));
    }
  });
};