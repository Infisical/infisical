import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { gatewaysQueryKeys } from "../gateways/queries";

export const useDeleteConnectorById = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      return apiRequest.delete(`/api/v1/connectors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(gatewaysQueryKeys.list());
    }
  });
};
