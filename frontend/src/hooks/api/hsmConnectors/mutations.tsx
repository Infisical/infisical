import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { hsmConnectorKeys } from "./queries";
import {
  TCreateHsmConnectorPayload,
  THsmConnector,
  THsmConnectorTestResult,
  TUpdateHsmConnectorPayload
} from "./types";

export const useCreateHsmConnector = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TCreateHsmConnectorPayload) => {
      const { data } = await apiRequest.post<{ hsmConnector: THsmConnector }>(
        "/api/v1/cert-manager/hsm-connectors",
        payload
      );
      return data.hsmConnector;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hsmConnectorKeys.all });
    }
  });
};

export const useUpdateHsmConnector = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ connectorId, ...patch }: TUpdateHsmConnectorPayload) => {
      const { data } = await apiRequest.patch<{ hsmConnector: THsmConnector }>(
        `/api/v1/cert-manager/hsm-connectors/${connectorId}`,
        patch
      );
      return data.hsmConnector;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hsmConnectorKeys.all });
      queryClient.invalidateQueries({ queryKey: hsmConnectorKeys.byId(variables.connectorId) });
      queryClient.invalidateQueries({
        queryKey: hsmConnectorKeys.linkedResourcesAll(variables.connectorId)
      });
    }
  });
};

export const useDeleteHsmConnector = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ connectorId }: { connectorId: string }) => {
      const { data } = await apiRequest.delete<{ id: string }>(
        `/api/v1/cert-manager/hsm-connectors/${connectorId}`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hsmConnectorKeys.all });
    }
  });
};

export const useTestHsmConnector = () => {
  return useMutation({
    mutationFn: async ({ connectorId }: { connectorId: string }) => {
      const { data } = await apiRequest.post<THsmConnectorTestResult>(
        `/api/v1/cert-manager/hsm-connectors/${connectorId}/test`
      );
      return data;
    }
  });
};
