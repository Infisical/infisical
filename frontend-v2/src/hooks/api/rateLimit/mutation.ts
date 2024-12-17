import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { rateLimitQueryKeys } from "./queries";
import { TRateLimit } from "./types";

export const useUpdateRateLimit = () => {
  const queryClient = useQueryClient();

  return useMutation<TRateLimit, object, TRateLimit>({
    mutationFn: async (opt) => {
      const { data } = await apiRequest.put<{ rateLimit: TRateLimit }>("/api/v1/rate-limit", opt);
      return data.rateLimit;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(rateLimitQueryKeys.rateLimit(), data);
      queryClient.invalidateQueries({ queryKey: rateLimitQueryKeys.rateLimit() });
    }
  });
};
