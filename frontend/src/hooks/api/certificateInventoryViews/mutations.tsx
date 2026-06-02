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
      name,
      filters,
      columns,
      isShared,
      applicationId
    }: TCreateInventoryViewDTO) => {
      const { data } = await apiRequest.post<{ view: TCertificateInventoryView }>(
        "/api/v1/cert-manager/certificate-inventory-views",
        { name, filters, columns, isShared, ...(applicationId && { applicationId }) }
      );
      return data.view;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: certificateInventoryViewKeys.all });
    }
  });
};

export const useUpdateCertificateInventoryView = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ viewId, name, filters, columns, isShared }: TUpdateInventoryViewDTO) => {
      const { data } = await apiRequest.patch<{ view: TCertificateInventoryView }>(
        `/api/v1/cert-manager/certificate-inventory-views/${viewId}`,
        { name, filters, columns, isShared }
      );
      return data.view;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: certificateInventoryViewKeys.all });
    }
  });
};

export const useDeleteCertificateInventoryView = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ viewId }: TDeleteInventoryViewDTO) => {
      const { data } = await apiRequest.delete<{ view: TCertificateInventoryView }>(
        `/api/v1/cert-manager/certificate-inventory-views/${viewId}`
      );
      return data.view;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: certificateInventoryViewKeys.all });
    }
  });
};
