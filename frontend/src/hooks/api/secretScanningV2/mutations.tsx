import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { secretScanningV2Keys } from "./queries";
import {
  TCreateSecretScanningDataSourceDTO,
  TDeleteSecretScanningDataSourceDTO,
  TSecretScanningDataSourceResponse,
  TSecretScanningFindingResponse,
  TTriggerSecretScanningDataSourceDTO,
  TUpdateSecretScanningDataSourceDTO,
  TUpdateSecretScanningFinding
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
    onSuccess: (_, { projectId, dataSourceId }) => {
      queryClient.invalidateQueries({
        queryKey: secretScanningV2Keys.listDataSources(projectId)
      });
      queryClient.invalidateQueries({
        queryKey: secretScanningV2Keys.dataSourceById(dataSourceId)
      });
      queryClient.invalidateQueries({
        queryKey: secretScanningV2Keys.listResources(dataSourceId)
      });
      queryClient.invalidateQueries({
        queryKey: secretScanningV2Keys.listScans(dataSourceId)
      });
    }
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
    onSuccess: (_, { projectId, dataSourceId }) => {
      queryClient.invalidateQueries({
        queryKey: secretScanningV2Keys.listDataSources(projectId)
      });
      queryClient.invalidateQueries({
        queryKey: secretScanningV2Keys.dataSourceById(dataSourceId)
      });
      queryClient.invalidateQueries({
        queryKey: secretScanningV2Keys.listResources(dataSourceId)
      });
      queryClient.invalidateQueries({
        queryKey: secretScanningV2Keys.listScans(dataSourceId)
      });
    }
  });
};

export const useTriggerSecretScanningDataSource = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, dataSourceId, resourceId }: TTriggerSecretScanningDataSourceDTO) => {
      const { data } = await apiRequest.post<TSecretScanningDataSourceResponse>(
        `/api/v2/secret-scanning/data-sources/${type}/${dataSourceId}${resourceId ? `/resources/${resourceId}` : ""}/scan`
      );

      return data.dataSource;
    },
    onSuccess: (_, { projectId, dataSourceId }) => {
      queryClient.invalidateQueries({
        queryKey: secretScanningV2Keys.listDataSources(projectId)
      });
      queryClient.invalidateQueries({
        queryKey: secretScanningV2Keys.dataSourceById(dataSourceId)
      });
      queryClient.invalidateQueries({
        queryKey: secretScanningV2Keys.listResources(dataSourceId)
      });
      queryClient.invalidateQueries({
        queryKey: secretScanningV2Keys.listScans(dataSourceId)
      });
    }
  });
};

export const useUpdateSecretScanningFinding = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ findingId, ...params }: TUpdateSecretScanningFinding) => {
      const { data } = await apiRequest.patch<TSecretScanningFindingResponse>(
        `/api/v2/secret-scanning/findings/${findingId}`,
        params
      );

      return data.finding;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: secretScanningV2Keys.listFindings(projectId)
      });
      // TODO: data source queries
    }
  });
};
