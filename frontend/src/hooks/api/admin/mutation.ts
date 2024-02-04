import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { User } from "../users/types";
import { adminQueryKeys } from "./queries";
import { TCreateAdminUserDTO, TServerConfig } from "./types";

export const useCreateAdminUser = () => {
  const queryClient = useQueryClient();

  return useMutation<{ user: User; token: string }, {}, TCreateAdminUserDTO>({
    mutationFn: async (opt) => {
      const { data } = await apiRequest.post("/api/v1/admin/signup", opt);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(adminQueryKeys.serverConfig());
    }
  });
};

export const useUpdateServerConfig = () => {
  const queryClient = useQueryClient();

  return useMutation<TServerConfig, {}, Partial<TServerConfig>>({
    mutationFn: async (opt) => {
      const { data } = await apiRequest.patch<{ config: TServerConfig }>(
        "/api/v1/admin/config",
        opt
      );
      return data.config;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(adminQueryKeys.serverConfig(), data);
      queryClient.invalidateQueries(adminQueryKeys.serverConfig());
    }
  });
};
