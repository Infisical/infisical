import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { workspaceKeys } from "../workspace";
import { CaType } from "./enums";
import { caKeys } from "./queries";
import {
  TCreateCertificateAuthorityDTO,
  TCreateCertificateDTO,
  TCreateCertificateResponse,
  TDeleteCertificateAuthorityDTO,
  TImportCaCertificateDTO,
  TImportCaCertificateResponse,
  TRenewCaDTO,
  TRenewCaResponse,
  TSignIntermediateDTO,
  TSignIntermediateResponse,
  TUnifiedCertificateAuthority,
  TUpdateCertificateAuthorityDTO
} from "./types";

export const useUpdateCa = () => {
  const queryClient = useQueryClient();
  return useMutation<TUnifiedCertificateAuthority, object, TUpdateCertificateAuthorityDTO>({
    mutationFn: async ({ caName, ...body }) => {
      const { data } = await apiRequest.patch<TUnifiedCertificateAuthority>(
        `/api/v1/pki/ca/${body.type}/${caName}`,
        body
      );

      return data;
    },
    onSuccess: ({ projectId, type }, { caName }) => {
      caKeys.getCaByNameAndProjectId(caName, projectId);
      queryClient.invalidateQueries({
        queryKey: caKeys.listCasByTypeAndProjectId(type, projectId)
      });
      queryClient.invalidateQueries({
        queryKey: caKeys.getCaByNameAndProjectId(caName, projectId)
      });
    }
  });
};

export const useCreateCa = () => {
  const queryClient = useQueryClient();
  return useMutation<TUnifiedCertificateAuthority, object, TCreateCertificateAuthorityDTO>({
    mutationFn: async (body) => {
      const { data } = await apiRequest.post<TUnifiedCertificateAuthority>(
        `/api/v1/pki/ca/${body.type}`,
        body
      );
      return data;
    },
    onSuccess: (_, { type, projectId }) => {
      queryClient.invalidateQueries({
        queryKey: caKeys.listCasByTypeAndProjectId(type, projectId)
      });
    }
  });
};

export const useDeleteCa = () => {
  const queryClient = useQueryClient();
  return useMutation<TUnifiedCertificateAuthority, object, TDeleteCertificateAuthorityDTO>({
    mutationFn: async ({ caName, type, projectId }) => {
      const { data } = await apiRequest.delete<TUnifiedCertificateAuthority>(
        `/api/v1/pki/ca/${type}/${caName}`,
        {
          data: {
            projectId
          }
        }
      );
      return data;
    },
    onSuccess: (_, { type, projectId }) => {
      queryClient.invalidateQueries({
        queryKey: caKeys.listCasByTypeAndProjectId(type, projectId)
      });
    }
  });
};

export const useSignIntermediate = () => {
  // TODO: consider renaming
  return useMutation<TSignIntermediateResponse, object, TSignIntermediateDTO>({
    mutationFn: async (body) => {
      const { data } = await apiRequest.post<TSignIntermediateResponse>(
        `/api/v1/pki/ca/${body.caId}/sign-intermediate`,
        body
      );
      return data;
    }
  });
};

export const useImportCaCertificate = (projectId: string) => {
  const queryClient = useQueryClient();
  return useMutation<TImportCaCertificateResponse, object, TImportCaCertificateDTO>({
    mutationFn: async ({ caId, ...body }) => {
      const { data } = await apiRequest.post<TImportCaCertificateResponse>(
        `/api/v1/pki/ca/${caId}/import-certificate`,
        body
      );
      return data;
    },
    onSuccess: (_, { caId, projectSlug }) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.getWorkspaceCas({ projectSlug }) });
      queryClient.invalidateQueries({ queryKey: caKeys.getCaCerts(caId) });
      queryClient.invalidateQueries({ queryKey: caKeys.getCaCert(caId) });
      queryClient.invalidateQueries({
        queryKey: caKeys.listCasByTypeAndProjectId(CaType.INTERNAL, projectId)
      });
    }
  });
};

// consider rename to issue certificate
export const useCreateCertificate = () => {
  const queryClient = useQueryClient();
  return useMutation<TCreateCertificateResponse, object, TCreateCertificateDTO>({
    mutationFn: async (body) => {
      const { data } = await apiRequest.post<TCreateCertificateResponse>(
        "/api/v1/pki/certificates/issue-certificate",
        body
      );
      return data;
    },
    onSuccess: (_, { projectSlug }) => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.forWorkspaceCertificates(projectSlug)
      });
    }
  });
};

export const useRenewCa = () => {
  const queryClient = useQueryClient();
  return useMutation<TRenewCaResponse, object, TRenewCaDTO>({
    mutationFn: async (body) => {
      const { data } = await apiRequest.post<TRenewCaResponse>(
        `/api/v1/pki/ca/${body.caId}/renew`,
        body
      );
      return data;
    },
    onSuccess: (_, { caId, projectSlug }) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.getWorkspaceCas({ projectSlug }) });
      queryClient.invalidateQueries({ queryKey: caKeys.getCaById(caId) });
      queryClient.invalidateQueries({ queryKey: caKeys.getCaCert(caId) });
      queryClient.invalidateQueries({ queryKey: caKeys.getCaCerts(caId) });
      queryClient.invalidateQueries({ queryKey: caKeys.getCaCsr(caId) });
      queryClient.invalidateQueries({ queryKey: caKeys.getCaCrl(caId) });
    }
  });
};
