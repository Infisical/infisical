import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { userKeys } from "../users/queries";
import {
  APIKeyDataV2,
  CreateAPIKeyDataV2DTO,
  CreateServiceTokenDataV3Res,
  DeleteAPIKeyDataV2DTO,
  UpdateAPIKeyDataV2DTO} from "./types";

export const useCreateAPIKeyV2 = () => {
  const queryClient = useQueryClient();
  return useMutation<CreateServiceTokenDataV3Res, {}, CreateAPIKeyDataV2DTO>({
    mutationFn: async ({
      name
    }) => {
      const { data } = await apiRequest.post("/api/v3/api-key", {
        name
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(userKeys.myAPIKeysV2);
    }
  });
};

export const useUpdateAPIKeyV2 = () => {
  const queryClient = useQueryClient();
  return useMutation<APIKeyDataV2, {}, UpdateAPIKeyDataV2DTO>({
    mutationFn: async ({
      apiKeyDataId,
      name
    }) => {
      const { data: { apiKeyData } } = await apiRequest.patch(`/api/v3/api-key/${apiKeyDataId}`, {
        name
      });
      return apiKeyData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(userKeys.myAPIKeysV2);
    }
  });
};

export const useDeleteAPIKeyV2 = () => {
  const queryClient = useQueryClient();
  return useMutation<APIKeyDataV2, {}, DeleteAPIKeyDataV2DTO>({
    mutationFn: async ({
      apiKeyDataId
    }) => {
      const { data: { apiKeyData } } = await apiRequest.delete(`/api/v3/api-key/${apiKeyDataId}`);
      return apiKeyData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(userKeys.myAPIKeysV2);
    }
  });
};