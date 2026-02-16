import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { kmipKeys } from "./queries";
import {
  KmipClientCertificate,
  TCreateKmipClient,
  TDeleteKmipClient,
  TGenerateKmipClientCertificate,
  TUpdateKmipClient
} from "./types";

export const useCreateKmipClient = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TCreateKmipClient) => {
      const { data } = await apiRequest.post("/api/v1/kmip/clients", payload);

      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: kmipKeys.getKmipClientsByProjectId({ projectId })
      });
    }
  });
};

export const useUpdateKmipClient = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, description, permissions }: TUpdateKmipClient) => {
      const { data } = await apiRequest.patch(`/api/v1/kmip/clients/${id}`, {
        name,
        description,
        permissions
      });

      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: kmipKeys.getKmipClientsByProjectId({ projectId })
      });
    }
  });
};

export const useDeleteKmipClients = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: TDeleteKmipClient) => {
      const { data } = await apiRequest.delete(`/api/v1/kmip/clients/${id}`);

      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: kmipKeys.getKmipClientsByProjectId({ projectId })
      });
    }
  });
};

export const useGenerateKmipClientCertificate = () => {
  return useMutation({
    mutationFn: async (payload: TGenerateKmipClientCertificate) => {
      const { data } = await apiRequest.post<KmipClientCertificate>(
        `/api/v1/kmip/clients/${payload.clientId}/certificates`,
        payload
      );

      return data;
    }
  });
};
