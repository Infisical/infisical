import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { organizationKeys } from "../organization/queries";
import { User } from "../users/types";
import { adminQueryKeys, adminStandaloneKeys } from "./queries";
import {
  AdminSlackConfig,
  TCreateAdminUserDTO,
  TServerConfig,
  TUpdateAdminSlackConfigDTO
} from "./types";

export const useCreateAdminUser = () => {
  const queryClient = useQueryClient();

  return useMutation<
    { user: User; token: string; organization: { id: string } },
    {},
    TCreateAdminUserDTO
  >({
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

  return useMutation<
    TServerConfig,
    {},
    Partial<TServerConfig & { slackClientId: string; slackClientSecret: string }>
  >({
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
      queryClient.invalidateQueries(organizationKeys.getUserOrganizations);
    }
  });
};

export const useAdminDeleteUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest.delete(`/api/v1/admin/user-management/users/${userId}`);

      return {};
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [adminStandaloneKeys.getUsers]
      });
    }
  });
};

export const useUpdateAdminSlackConfig = () => {
  const queryClient = useQueryClient();
  return useMutation<AdminSlackConfig, {}, TUpdateAdminSlackConfigDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.put<AdminSlackConfig>(
        "/api/v1/admin/integrations/slack/config",
        dto
      );

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(adminQueryKeys.getAdminSlackConfig());
    }
  });
};
