import { apiRequest } from "@app/config/request";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { gatewaysQueryKeys } from "./queries";

export const useDeleteGateway = () => {
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
