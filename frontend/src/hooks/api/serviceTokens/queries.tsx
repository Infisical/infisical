import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { workspaceKeys } from "../workspace/queries";
import {
  CreateServiceTokenDataV3DTO,
  CreateServiceTokenDataV3Res,
  CreateServiceTokenDTO,
  CreateServiceTokenRes,
  DeleteServiceTokenDataV3DTO,
  DeleteServiceTokenRes,
  ServiceToken,
  ServiceTokenDataV3,
  UpdateServiceTokenDataV3DTO} from "./types";

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
export const useCreateServiceToken = () => { // TODO: deprecate
  const queryClient = useQueryClient();

  return useMutation<CreateServiceTokenRes, {}, CreateServiceTokenDTO>({
    mutationFn: async (body) => {
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
      const { data } = await apiRequest.delete(`/api/v2/service-token/${serviceTokenId}`);
      return data;
    },
    onSuccess: ({ serviceTokenData: { workspace } }) => {
      queryClient.invalidateQueries(serviceTokenKeys.getAllWorkspaceServiceToken(workspace));
    }
  });
};

export const useCreateServiceTokenV3 = () => {
  const queryClient = useQueryClient();
  return useMutation<CreateServiceTokenDataV3Res, {}, CreateServiceTokenDataV3DTO>({
    mutationFn: async (body) => {
      const { data } = await apiRequest.post("/api/v3/service-token/", body);
      return data;
    },
    onSuccess: ({ serviceTokenData }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceServiceTokenDataV3(serviceTokenData.workspace));
    }
  });
};

export const useUpdateServiceTokenV3 = () => {
  const queryClient = useQueryClient();
  return useMutation<ServiceTokenDataV3, {}, UpdateServiceTokenDataV3DTO>({
    mutationFn: async ({
      serviceTokenDataId,
      name,
      role,
      isActive,
      trustedIps,
      expiresIn,
      accessTokenTTL,
      isRefreshTokenRotationEnabled
    }) => {
      const { data: { serviceTokenData } } = await apiRequest.patch(`/api/v3/service-token/${serviceTokenDataId}`, {
        name,
        role,
        isActive,
        trustedIps,
        expiresIn,
        accessTokenTTL,
        isRefreshTokenRotationEnabled
      });

      return serviceTokenData;
    },
    onSuccess: ({ workspace }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceServiceTokenDataV3(workspace));
    }
  });
};

export const useDeleteServiceTokenV3 = () => {
  const queryClient = useQueryClient();
  return useMutation<ServiceTokenDataV3, {}, DeleteServiceTokenDataV3DTO>({
    mutationFn: async ({
      serviceTokenDataId
    }) => {
      const { data: { serviceTokenData } } = await apiRequest.delete(`/api/v3/service-token/${serviceTokenDataId}`);
      return serviceTokenData;
    },
    onSuccess: ({ workspace }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceServiceTokenDataV3(workspace));
    }
  });
};