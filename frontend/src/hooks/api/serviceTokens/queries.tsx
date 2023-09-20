import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  CreateServiceTokenDTO,
  CreateServiceTokenRes,
  DeleteServiceTokenRes,
  ServiceToken,
  ServiceTokenDataV3,
  CreateServiceTokenDataV3DTO,
  CreateServiceTokenDataV3Res,
  UpdateServiceTokenDataV3DTO,
  DeleteServiceTokenDataV3DTO
} from "./types";
import { workspaceKeys } from "../workspace/queries";

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
      console.log("useDeleteServiceToken");
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
      isActive
    }) => {
      const { data: { serviceTokenData } } = await apiRequest.patch(`/api/v3/service-token/${serviceTokenDataId}`, {
        name,
        isActive
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
      console.log("useDeleteServiceTokenV3");
      const { data: { serviceTokenData } } = await apiRequest.delete(`/api/v3/service-token/${serviceTokenDataId}`);
      console.log("useDeleteServiceTokenV3 serviceTokenData: ", serviceTokenData);
      return serviceTokenData;
    },
    onSuccess: ({ workspace }) => {
      console.log("useDeleteServiceTokenV3 onSuccess: ", workspace);
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceServiceTokenDataV3(workspace));
    }
  });
};