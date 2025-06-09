import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { gatewaysQueryKeys } from "./queries";
import { TUpdateGatewayDTO } from "./types";

export const useDeleteGatewayById = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      return apiRequest.delete(`/api/v1/gateways/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(gatewaysQueryKeys.list());
    }
  });
};

export const useUpdateGatewayById = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: TUpdateGatewayDTO) => {
      return apiRequest.patch(`/api/v1/gateways/${id}`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(gatewaysQueryKeys.list());
    }
  });
};
