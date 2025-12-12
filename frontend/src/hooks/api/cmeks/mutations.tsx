import { useMutation, useQueryClient } from "@tanstack/react-query";

import { encodeBase64 } from "@app/components/utilities/cryptography/crypto";
import { apiRequest } from "@app/config/request";
import { cmekKeys } from "@app/hooks/api/cmeks/queries";
import {
  TCmekDecrypt,
  TCmekDecryptResponse,
  TCmekEncrypt,
  TCmekEncryptResponse,
  TCmekSign,
  TCmekSignResponse,
  TCmekVerify,
  TCmekVerifyResponse,
  TCreateCmek,
  TDeleteCmek,
  TRollbackCmek,
  TRollbackCmekResponse,
  TRotateCmek,
  TRotateCmekResponse,
  TUpdateCmek,
  TUpdateScheduledRotationDTO,
  TUpdateScheduledRotationResponse
} from "@app/hooks/api/cmeks/types";

export const useCreateCmek = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TCreateCmek) => {
      const { data } = await apiRequest.post("/api/v1/kms/keys", payload);

      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: cmekKeys.getCmeksByProjectId({ projectId }) });
    }
  });
};

export const useUpdateCmek = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ keyId, name, description, isDisabled }: TUpdateCmek) => {
      const { data } = await apiRequest.patch(`/api/v1/kms/keys/${keyId}`, {
        name,
        description,
        isDisabled
      });

      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: cmekKeys.getCmeksByProjectId({ projectId }) });
    }
  });
};

export const useDeleteCmek = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ keyId }: TDeleteCmek) => {
      const { data } = await apiRequest.delete(`/api/v1/kms/keys/${keyId}`);

      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: cmekKeys.getCmeksByProjectId({ projectId }) });
    }
  });
};

export const useCmekEncrypt = () => {
  return useMutation({
    mutationFn: async ({ keyId, plaintext, isBase64Encoded }: TCmekEncrypt) => {
      const { data } = await apiRequest.post<TCmekEncryptResponse>(
        `/api/v1/kms/keys/${keyId}/encrypt`,
        {
          plaintext: isBase64Encoded ? plaintext : encodeBase64(Buffer.from(plaintext))
        }
      );

      return data;
    }
  });
};

export const useCmekSign = () => {
  return useMutation({
    mutationFn: async ({
      keyId,
      data,
      signingAlgorithm,
      isBase64Encoded,
      isDigest = false
    }: TCmekSign & { isBase64Encoded: boolean }) => {
      const res = await apiRequest.post<TCmekSignResponse>(`/api/v1/kms/keys/${keyId}/sign`, {
        data: isBase64Encoded ? data : encodeBase64(Buffer.from(data)),
        signingAlgorithm,
        isDigest
      });

      return res.data;
    }
  });
};

export const useCmekVerify = () => {
  return useMutation({
    mutationFn: async ({
      keyId,
      data,
      signature,
      signingAlgorithm,
      isBase64Encoded,
      isDigest = false
    }: TCmekVerify & { isBase64Encoded: boolean }) => {
      const res = await apiRequest.post<TCmekVerifyResponse>(`/api/v1/kms/keys/${keyId}/verify`, {
        data: isBase64Encoded ? data : encodeBase64(Buffer.from(data)),
        signature,
        signingAlgorithm,
        isDigest
      });

      return res.data;
    }
  });
};

export const useCmekDecrypt = () => {
  return useMutation({
    mutationFn: async ({ keyId, ciphertext }: TCmekDecrypt) => {
      const { data } = await apiRequest.post<TCmekDecryptResponse>(
        `/api/v1/kms/keys/${keyId}/decrypt`,
        {
          ciphertext
        }
      );

      return data;
    }
  });
};

export const useRotateCmek = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ keyId }: TRotateCmek) => {
      const { data } = await apiRequest.post<TRotateCmekResponse>(
        `/api/v1/kms/keys/${keyId}/rotate`
      );

      return data;
    },
    onSuccess: (_, { keyId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: cmekKeys.getCmeksByProjectId({ projectId }) });
      queryClient.invalidateQueries({ queryKey: cmekKeys.getVersions(keyId) });
    }
  });
};

export const useRollbackCmek = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ keyId, targetVersion }: TRollbackCmek) => {
      const { data } = await apiRequest.post<TRollbackCmekResponse>(
        `/api/v1/kms/keys/${keyId}/rollback`,
        { targetVersion }
      );

      return data;
    },
    onSuccess: (_, { keyId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: cmekKeys.getCmeksByProjectId({ projectId }) });
      queryClient.invalidateQueries({ queryKey: cmekKeys.getVersions(keyId) });
    }
  });
};

export const useUpdateCmekScheduledRotation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      keyId,
      enableAutoRotation,
      rotationIntervalDays
    }: TUpdateScheduledRotationDTO) => {
      const { data } = await apiRequest.put<TUpdateScheduledRotationResponse>(
        `/api/v1/kms/keys/${keyId}/scheduled-rotation`,
        {
          enableAutoRotation,
          rotationIntervalDays
        }
      );

      return data;
    },
    onSuccess: (_, { keyId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: cmekKeys.getScheduledRotation(keyId) });
      queryClient.invalidateQueries({ queryKey: cmekKeys.getCmeksByProjectId({ projectId }) });
    }
  });
};
