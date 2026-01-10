import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { secretSharingKeys } from "./queries";
import {
  TCreatedSharedSecret,
  TCreateSecretRequestRequestDTO,
  TCreateSharedSecretRequest,
  TDeleteSecretRequestDTO,
  TDeleteSharedSecretRequestDTO,
  TRevealedSecretRequest,
  TRevealSecretRequestValueRequest,
  TSetSecretRequestValueRequest,
  TSharedSecret
} from "./types";

export const useCreateSharedSecret = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (inputData: TCreateSharedSecretRequest) => {
      const { data } = await apiRequest.post<TCreatedSharedSecret>(
        "/api/v1/secret-sharing/shared",
        inputData
      );
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: secretSharingKeys.allSharedSecrets() })
  });
};

export const useCreatePublicSharedSecret = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (inputData: TCreateSharedSecretRequest) => {
      const { data } = await apiRequest.post<TCreatedSharedSecret>(
        "/api/v1/secret-sharing/shared/public",
        inputData
      );
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: secretSharingKeys.allSharedSecrets() })
  });
};

export const useCreateSecretRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (inputData: TCreateSecretRequestRequestDTO) => {
      const { data } = await apiRequest.post<TCreatedSharedSecret>(
        "/api/v1/secret-sharing/requests",
        inputData
      );
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: secretSharingKeys.allSecretRequests() })
  });
};

export const useSetSecretRequestValue = () => {
  return useMutation({
    mutationFn: async (inputData: TSetSecretRequestValueRequest) => {
      const { data } = await apiRequest.post<TSharedSecret>(
        `/api/v1/secret-sharing/requests/${inputData.id}/set-value`,
        inputData
      );
      return data;
    }
  });
};

export const useRevealSecretRequestValue = () => {
  return useMutation({
    mutationFn: async (inputData: TRevealSecretRequestValueRequest) => {
      const { data } = await apiRequest.post<TRevealedSecretRequest>(
        `/api/v1/secret-sharing/requests/${inputData.id}/reveal-value`,
        inputData
      );
      return data.secretRequest;
    }
  });
};
export const useDeleteSharedSecret = () => {
  const queryClient = useQueryClient();
  return useMutation<TSharedSecret, { message: string }, { sharedSecretId: string }>({
    mutationFn: async ({ sharedSecretId }: TDeleteSharedSecretRequestDTO) => {
      const { data } = await apiRequest.delete<TSharedSecret>(
        `/api/v1/secret-sharing/shared/${sharedSecretId}`
      );
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: secretSharingKeys.allSharedSecrets() })
  });
};

export const useDeleteSecretRequest = () => {
  const queryClient = useQueryClient();
  return useMutation<TSharedSecret, unknown, TDeleteSecretRequestDTO>({
    mutationFn: async ({ secretRequestId }: TDeleteSecretRequestDTO) => {
      const { data } = await apiRequest.delete<TSharedSecret>(
        `/api/v1/secret-sharing/requests/${secretRequestId}`
      );

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: secretSharingKeys.allSecretRequests() });
    }
  });
};

export const useUploadBrandingAsset = () => {
  const queryClient = useQueryClient();
  return useMutation<
    { message: string },
    { message: string },
    { assetType: "logo" | "favicon"; file: File }
  >({
    mutationFn: async ({ assetType, file }) => {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await apiRequest.post<{ message: string }>(
        `/api/v1/secret-sharing/shared/branding/${assetType}`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data"
          }
        }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: secretSharingKeys.brandingAssets() });
    }
  });
};

export const useDeleteBrandingAsset = () => {
  const queryClient = useQueryClient();
  return useMutation<{ message: string }, { message: string }, { assetType: "logo" | "favicon" }>({
    mutationFn: async ({ assetType }) => {
      const { data } = await apiRequest.delete<{ message: string }>(
        `/api/v1/secret-sharing/shared/branding/${assetType}`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: secretSharingKeys.brandingAssets() });
    }
  });
};
