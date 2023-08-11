import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  CreateServiceTokenDTO,
  CreateServiceTokenRes,
  DeleteServiceTokenRes,
  ServiceToken
} from "./types";

const serviceTokenKeys = {
  getAllWorkspaceServiceToken: (workspaceID: string) => [{ workspaceID }, "service-tokens"] as const
};

const fetchWorkspaceServiceTokens = async (workspaceID: string) => {
  const { data } = await apiRequest.get<{ serviceTokenData: ServiceToken[] }>(
    `/api/v2/workspace/${workspaceID}/service-token-data`
  );

  return data.serviceTokenData;
};

type UseGetWorkspaceServiceTokensProps = { workspaceID: string };

export const useGetUserWsServiceTokens = ({ workspaceID }: UseGetWorkspaceServiceTokensProps) => {
  return useQuery({
    queryKey: serviceTokenKeys.getAllWorkspaceServiceToken(workspaceID),
    queryFn: () => fetchWorkspaceServiceTokens(workspaceID),
    enabled: Boolean(workspaceID)
  });
}

// mutation
export const useCreateServiceToken = () => {
  const queryClient = useQueryClient();

  return useMutation<CreateServiceTokenRes, {}, CreateServiceTokenDTO>({
    mutationFn: async (body) => {
      console.log("useCreateServiceToken");
      const { data } = await apiRequest.post("/api/v2/service-token/", body);
      data.serviceToken += `.${body.randomBytes}`;
      return data;
    },
    onSuccess: ({ serviceTokenData: { workspace } }) => {
      queryClient.invalidateQueries(serviceTokenKeys.getAllWorkspaceServiceToken(workspace));
    }
  });
};

export const useDeleteServiceToken = () => {
  const queryClient = useQueryClient();

  return useMutation<DeleteServiceTokenRes, {}, string>({
    mutationFn: async (serviceTokenId) => {
      console.log("useDeleteServiceToken");
      const { data } = await apiRequest.delete(`/api/v2/service-token/${serviceTokenId}`);
      return data;
    },
    onSuccess: ({ serviceTokenData: { workspace } }) => {
      queryClient.invalidateQueries(serviceTokenKeys.getAllWorkspaceServiceToken(workspace));
    }
  });
};
