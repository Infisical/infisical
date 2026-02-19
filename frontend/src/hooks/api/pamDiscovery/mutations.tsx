import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { pamDiscoveryKeys } from "./queries";
import {
  TCreatePamDiscoverySourceDTO,
  TDeletePamDiscoverySourceDTO,
  TPamDiscoverySource,
  TTriggerPamDiscoveryScanDTO,
  TUpdatePamDiscoverySourceDTO
} from "./types";

export const useCreatePamDiscoverySource = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ discoveryType, ...dto }: TCreatePamDiscoverySourceDTO) => {
      const { data } = await apiRequest.post<{ source: TPamDiscoverySource }>(
        `/api/v1/pam/discovery/${discoveryType}`,
        dto
      );
      return data.source;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pamDiscoveryKeys.sources() });
    }
  });
};

export const useUpdatePamDiscoverySource = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      discoverySourceId,
      discoveryType,
      ...dto
    }: TUpdatePamDiscoverySourceDTO) => {
      const { data } = await apiRequest.patch<{ source: TPamDiscoverySource }>(
        `/api/v1/pam/discovery/${discoveryType}/${discoverySourceId}`,
        dto
      );
      return data.source;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pamDiscoveryKeys.all });
    }
  });
};

export const useDeletePamDiscoverySource = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ discoverySourceId, discoveryType }: TDeletePamDiscoverySourceDTO) => {
      const { data } = await apiRequest.delete(
        `/api/v1/pam/discovery/${discoveryType}/${discoverySourceId}`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pamDiscoveryKeys.sources() });
    }
  });
};

export const useTriggerPamDiscoveryScan = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ discoverySourceId, discoveryType }: TTriggerPamDiscoveryScanDTO) => {
      const { data } = await apiRequest.post(
        `/api/v1/pam/discovery/${discoveryType}/${discoverySourceId}/scan`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pamDiscoveryKeys.all });
    }
  });
};
