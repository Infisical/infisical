import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { certificateInventoryViewKeys } from "./queries";
import {
  TCertificateInventoryView,
  TCreateInventoryViewDTO,
  TDeleteInventoryViewDTO,
  TUpdateInventoryViewDTO
} from "./types";

export const useCreateCertificateInventoryView = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      name,
      filters,
      columns,
      isShared
    }: TCreateInventoryViewDTO) => {
      const { data } = await apiRequest.post<{ view: TCertificateInventoryView }>(
        `/api/v1/projects/${projectId}/certificate-inventory-views`,
        { name, filters, columns, isShared }
      );
      return data.view;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: certificateInventoryViewKeys.list(projectId) });
    }
  });
};

export const useUpdateCertificateInventoryView = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      viewId,
      name,
      filters,
      columns,
      isShared
    }: TUpdateInventoryViewDTO) => {
      const { data } = await apiRequest.patch<{ view: TCertificateInventoryView }>(
        `/api/v1/projects/${projectId}/certificate-inventory-views/${viewId}`,
        { name, filters, columns, isShared }
      );
      return data.view;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: certificateInventoryViewKeys.list(projectId) });
    }
  });
};

export const useDeleteCertificateInventoryView = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, viewId }: TDeleteInventoryViewDTO) => {
      const { data } = await apiRequest.delete<{ view: TCertificateInventoryView }>(
        `/api/v1/projects/${projectId}/certificate-inventory-views/${viewId}`
      );
      return data.view;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: certificateInventoryViewKeys.list(projectId) });
    }
  });
};
