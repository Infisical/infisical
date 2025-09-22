import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { relayQueryKeys } from "./queries";

export const useDeleteRelayById = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      return apiRequest.delete(`/api/v1/relays/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: relayQueryKeys.list() });
    }
  });
};
