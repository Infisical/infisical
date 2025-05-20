import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { secretScanningV2Keys } from "./queries";
import {
  TCreateSecretScanningDataSourceDTO,
  TDeleteSecretScanningDataSourceDTO,
  TSecretScanningDataSourceResponse,
  TUpdateSecretScanningDataSourceDTO
} from "./types";

export const useCreateSecretScanningDataSource = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, ...params }: TCreateSecretScanningDataSourceDTO) => {
      const { data } = await apiRequest.post<TSecretScanningDataSourceResponse>(
        `/api/v2/secret-scanning/data-sources/${type}`,
        params
      );

      return data.dataSource;
    },
    onSuccess: (_, { projectId }) =>
      queryClient.invalidateQueries({
        queryKey: secretScanningV2Keys.listDataSources(projectId)
        // TODO: single view
      })
  });
};

export const useUpdateSecretScanningDataSource = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, dataSourceId, ...params }: TUpdateSecretScanningDataSourceDTO) => {
      const { data } = await apiRequest.patch<TSecretScanningDataSourceResponse>(
        `/api/v2/secret-scanning/data-sources/${type}/${dataSourceId}`,
        params
      );

      return data.dataSource;
    },
    onSuccess: (_, { projectId }) =>
      queryClient.invalidateQueries({
        queryKey: secretScanningV2Keys.listDataSources(projectId)
        // TODO: single view
      })
  });
};

export const useDeleteSecretScanningDataSource = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, dataSourceId }: TDeleteSecretScanningDataSourceDTO) => {
      const { data } = await apiRequest.delete<TSecretScanningDataSourceResponse>(
        `/api/v2/secret-scanning/data-sources/${type}/${dataSourceId}`
      );

      return data.dataSource;
    },
    onSuccess: (_, { projectId }) =>
      queryClient.invalidateQueries({
        queryKey: secretScanningV2Keys.listDataSources(projectId)
        // TODO: single view
      })
  });
};
