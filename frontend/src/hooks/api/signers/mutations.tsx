import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createNotification } from "@app/components/notifications";
import { apiRequest } from "@app/config/request";

import { signerKeys } from "./queries";
import { TCreateSignerDTO, TDeleteSignerDTO, TSigner, TUpdateSignerDTO } from "./types";

export const useCreateSigner = () => {
  const queryClient = useQueryClient();

  return useMutation<TSigner, object, TCreateSignerDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post<TSigner>("/api/v1/cert-manager/signers", dto);
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: signerKeys.list(projectId) });
      createNotification({ text: "Signer created successfully", type: "success" });
    }
  });
};

export const useUpdateSigner = () => {
  const queryClient = useQueryClient();

  return useMutation<TSigner, object, TUpdateSignerDTO>({
    mutationFn: async ({ signerId, ...body }) => {
      const { data } = await apiRequest.patch<TSigner>(
        `/api/v1/cert-manager/signers/${signerId}`,
        body
      );
      return data;
    },
    onSuccess: (signer) => {
      queryClient.invalidateQueries({ queryKey: signerKeys.list(signer.projectId) });
      queryClient.invalidateQueries({ queryKey: signerKeys.byId(signer.id) });
      createNotification({ text: "Signer updated successfully", type: "success" });
    }
  });
};

export const useDeleteSigner = () => {
  const queryClient = useQueryClient();

  return useMutation<TSigner, object, TDeleteSignerDTO & { projectId: string }>({
    mutationFn: async ({ signerId }) => {
      const { data } = await apiRequest.delete<TSigner>(`/api/v1/cert-manager/signers/${signerId}`);
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: signerKeys.list(projectId) });
      createNotification({ text: "Signer deleted successfully", type: "success" });
    }
  });
};
