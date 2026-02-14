import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections/queries";
import {
  TAppConnectionResponse,
  TCreateAppConnectionDTO,
  TDeleteAppConnectionDTO,
  TUpdateAppConnectionDTO
} from "@app/hooks/api/appConnections/types";

export const useCreateAppConnection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ app, ...params }: TCreateAppConnectionDTO) => {
      const { data } = await apiRequest.post<TAppConnectionResponse>(
        `/api/v1/app-connections/${app}`,
        params
      );

      return data.appConnection;
    },
    onSuccess: ({ projectId, app }) => {
      queryClient.invalidateQueries({ queryKey: appConnectionKeys.list(projectId) });
      queryClient.invalidateQueries({ queryKey: appConnectionKeys.listAvailable(app, projectId) });
    }
  });
};

export const useUpdateAppConnection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ connectionId, app, ...params }: TUpdateAppConnectionDTO) => {
      const { data } = await apiRequest.patch<TAppConnectionResponse>(
        `/api/v1/app-connections/${app}/${connectionId}`,
        params
      );

      return data.appConnection;
    },
    onSuccess: ({ projectId, app }) => {
      queryClient.invalidateQueries({ queryKey: appConnectionKeys.list(projectId) });
      queryClient.invalidateQueries({ queryKey: appConnectionKeys.listAvailable(app, projectId) });
      // queryClient.invalidateQueries({ queryKey: appConnectionKeys.byId(app, connectionId) });
    }
  });
};

export const useDeleteAppConnection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ connectionId, app }: TDeleteAppConnectionDTO) => {
      const { data } = await apiRequest.delete(`/api/v1/app-connections/${app}/${connectionId}`, {});

      return data;
    },
    onSuccess: ({ projectId, app }) => {
      queryClient.invalidateQueries({ queryKey: appConnectionKeys.list(projectId) });
      queryClient.invalidateQueries({ queryKey: appConnectionKeys.listAvailable(app, projectId) });
      // queryClient.invalidateQueries({ queryKey: appConnectionKeys.byId(app, connectionId) });
    }
  });
};
