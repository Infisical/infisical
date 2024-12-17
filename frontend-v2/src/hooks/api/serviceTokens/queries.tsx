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
    `/api/v1/workspace/${workspaceID}/service-token-data`
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
};

// mutation
export const useCreateServiceToken = () => {
  // TODO: deprecate
  const queryClient = useQueryClient();

  return useMutation<CreateServiceTokenRes, object, CreateServiceTokenDTO>({
    mutationFn: async (body) => {
      const { data } = await apiRequest.post("/api/v2/service-token/", body);
      data.serviceToken += `.${body.randomBytes}`;
      return data;
    },
    onSuccess: ({ serviceTokenData: { projectId } }) => {
      queryClient.invalidateQueries({
        queryKey: serviceTokenKeys.getAllWorkspaceServiceToken(projectId)
      });
    }
  });
};

export const useDeleteServiceToken = () => {
  const queryClient = useQueryClient();

  return useMutation<DeleteServiceTokenRes, object, string>({
    mutationFn: async (serviceTokenId) => {
      const { data } = await apiRequest.delete(`/api/v2/service-token/${serviceTokenId}`);
      return data;
    },
    onSuccess: ({ serviceTokenData: { projectId } }) => {
      queryClient.invalidateQueries({
        queryKey: serviceTokenKeys.getAllWorkspaceServiceToken(projectId)
      });
    }
  });
};
