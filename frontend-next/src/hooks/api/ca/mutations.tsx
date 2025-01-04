import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { workspaceKeys } from "../workspace";
import { caKeys } from "./queries";
import {
  TCertificateAuthority,
  TCreateCaDTO,
  TCreateCertificateDTO,
  TCreateCertificateResponse,
  TDeleteCaDTO,
  TImportCaCertificateDTO,
  TImportCaCertificateResponse,
  TRenewCaDTO,
  TRenewCaResponse,
  TSignIntermediateDTO,
  TSignIntermediateResponse,
  TUpdateCaDTO
} from "./types";

export const useCreateCa = () => {
  const queryClient = useQueryClient();
  return useMutation<TCertificateAuthority, {}, TCreateCaDTO>({
    mutationFn: async (body) => {
      const {
        data: { ca }
      } = await apiRequest.post<{ ca: TCertificateAuthority }>("/api/v1/pki/ca/", body);
      return ca;
    },
    onSuccess: (_, { projectSlug }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceCas({ projectSlug }));
    }
  });
};

export const useUpdateCa = () => {
  const queryClient = useQueryClient();
  return useMutation<TCertificateAuthority, {}, TUpdateCaDTO>({
    mutationFn: async ({ caId, projectSlug, ...body }) => {
      const {
        data: { ca }
      } = await apiRequest.patch<{ ca: TCertificateAuthority }>(`/api/v1/pki/ca/${caId}`, body);
      return ca;
    },
    onSuccess: ({ id }, { projectSlug }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceCas({ projectSlug }));
      queryClient.invalidateQueries(caKeys.getCaById(id));
    }
  });
};

export const useDeleteCa = () => {
  const queryClient = useQueryClient();
  return useMutation<TCertificateAuthority, {}, TDeleteCaDTO>({
    mutationFn: async ({ caId }) => {
      const {
        data: { ca }
      } = await apiRequest.delete<{ ca: TCertificateAuthority }>(`/api/v1/pki/ca/${caId}`);
      return ca;
    },
    onSuccess: (_, { projectSlug }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceCas({ projectSlug }));
    }
  });
};

export const useSignIntermediate = () => {
  // TODO: consider renaming
  return useMutation<TSignIntermediateResponse, {}, TSignIntermediateDTO>({
    mutationFn: async (body) => {
      const { data } = await apiRequest.post<TSignIntermediateResponse>(
        `/api/v1/pki/ca/${body.caId}/sign-intermediate`,
        body
      );
      return data;
    }
  });
};

export const useImportCaCertificate = () => {
  const queryClient = useQueryClient();
  return useMutation<TImportCaCertificateResponse, {}, TImportCaCertificateDTO>({
    mutationFn: async ({ caId, ...body }) => {
      const { data } = await apiRequest.post<TImportCaCertificateResponse>(
        `/api/v1/pki/ca/${caId}/import-certificate`,
        body
      );
      return data;
    },
    onSuccess: (_, { caId, projectSlug }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceCas({ projectSlug }));
      queryClient.invalidateQueries(caKeys.getCaCerts(caId));
      queryClient.invalidateQueries(caKeys.getCaCert(caId));
    }
  });
};

// consider rename to issue certificate
export const useCreateCertificate = () => {
  const queryClient = useQueryClient();
  return useMutation<TCreateCertificateResponse, {}, TCreateCertificateDTO>({
    mutationFn: async (body) => {
      const { data } = await apiRequest.post<TCreateCertificateResponse>(
        "/api/v1/pki/certificates/issue-certificate",
        body
      );
      return data;
    },
    onSuccess: (_, { projectSlug }) => {
      queryClient.invalidateQueries(workspaceKeys.forWorkspaceCertificates(projectSlug));
    }
  });
};

export const useRenewCa = () => {
  const queryClient = useQueryClient();
  return useMutation<TRenewCaResponse, {}, TRenewCaDTO>({
    mutationFn: async (body) => {
      const { data } = await apiRequest.post<TRenewCaResponse>(
        `/api/v1/pki/ca/${body.caId}/renew`,
        body
      );
      return data;
    },
    onSuccess: (_, { caId, projectSlug }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceCas({ projectSlug }));
      queryClient.invalidateQueries(caKeys.getCaById(caId));
      queryClient.invalidateQueries(caKeys.getCaCert(caId));
      queryClient.invalidateQueries(caKeys.getCaCerts(caId));
      queryClient.invalidateQueries(caKeys.getCaCsr(caId));
      queryClient.invalidateQueries(caKeys.getCaCrl(caId));
    }
  });
};
