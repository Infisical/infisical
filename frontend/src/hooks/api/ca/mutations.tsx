import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { projectKeys } from "../projects";
import { CaType } from "./enums";
import { caKeys } from "./queries";
import {
  TCreateCertificateAuthorityDTO,
  TCreateCertificateDTO,
  TCreateCertificateResponse,
  TCreateCertificateV3DTO,
  TCreateCertificateV3Response,
  TDeleteCertificateAuthorityDTO,
  TImportCaCertificateDTO,
  TImportCaCertificateResponse,
  TOrderCertificateDTO,
  TOrderCertificateResponse,
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
    mutationFn: async ({ id, ...body }) => {
      const { data } = await apiRequest.patch<TUnifiedCertificateAuthority>(
        `/api/v1/cert-manager/ca/${body.type}/${id}`,
        body
      );

      return data;
    },
    onSuccess: ({ projectId, type }, { id }) => {
      queryClient.invalidateQueries({
        queryKey: caKeys.listCasByTypeAndProjectId(type, projectId)
      });
      queryClient.invalidateQueries({
        queryKey: caKeys.getCaById(id)
      });
      // Invalidate external CAs list
      queryClient.invalidateQueries({
        queryKey: caKeys.listExternalCasByProjectId(projectId)
      });
    }
  });
};

export const useCreateCa = () => {
  const queryClient = useQueryClient();
  return useMutation<TUnifiedCertificateAuthority, object, TCreateCertificateAuthorityDTO>({
    mutationFn: async (body) => {
      const { data } = await apiRequest.post<TUnifiedCertificateAuthority>(
        `/api/v1/cert-manager/ca/${body.type}`,
        body
      );
      return data;
    },
    onSuccess: (_, { type, projectId }) => {
      queryClient.invalidateQueries({
        queryKey: caKeys.listCasByTypeAndProjectId(type, projectId)
      });
      // Invalidate external CAs list
      queryClient.invalidateQueries({
        queryKey: caKeys.listExternalCasByProjectId(projectId)
      });
    }
  });
};

export const useDeleteCa = () => {
  const queryClient = useQueryClient();
  return useMutation<TUnifiedCertificateAuthority, object, TDeleteCertificateAuthorityDTO>({
    mutationFn: async ({ id, type }) => {
      const { data } = await apiRequest.delete<TUnifiedCertificateAuthority>(
        `/api/v1/cert-manager/ca/${type}/${id}`
      );
      return data;
    },
    onSuccess: (_, { type, projectId }) => {
      queryClient.invalidateQueries({
        queryKey: caKeys.listCasByTypeAndProjectId(type, projectId)
      });
      // Invalidate external CAs list
      queryClient.invalidateQueries({
        queryKey: caKeys.listExternalCasByProjectId(projectId)
      });
    }
  });
};

export const useSignIntermediate = () => {
  // TODO: consider renaming
  return useMutation<TSignIntermediateResponse, object, TSignIntermediateDTO>({
    mutationFn: async (body) => {
      const { data } = await apiRequest.post<TSignIntermediateResponse>(
        `/api/v1/cert-manager/ca/internal/${body.caId}/sign-intermediate`,
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
        `/api/v1/cert-manager/ca/internal/${caId}/import-certificate`,
        body
      );
      return data;
    },
    onSuccess: (_, { caId }) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.getProjectCas({ projectId }) });
      queryClient.invalidateQueries({ queryKey: caKeys.getCaById(caId) });
      queryClient.invalidateQueries({ queryKey: caKeys.getCaCerts(caId) });
      queryClient.invalidateQueries({ queryKey: caKeys.getCaCert(caId) });
      queryClient.invalidateQueries({
        queryKey: caKeys.listCasByTypeAndProjectId(CaType.INTERNAL, projectId)
      });
    }
  });
};

// TODO: DEPRECATE
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
        queryKey: projectKeys.forProjectCertificates(projectSlug)
      });
    }
  });
};

export const useCreateCertificateV3 = (options?: { projectId?: string }) => {
  const queryClient = useQueryClient();
  return useMutation<TCreateCertificateV3Response, object, TCreateCertificateV3DTO>({
    mutationFn: async (body) => {
      const { data } = await apiRequest.post<TCreateCertificateV3Response>(
        "/api/v1/cert-manager/certificates/issue-certificate",
        body
      );
      return data;
    },
    onSuccess: (_, { projectSlug }) => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.forProjectCertificates(projectSlug)
      });

      if (options?.projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.forProjectCertificates(options.projectId)
        });
      }

      queryClient.invalidateQueries({
        queryKey: ["certificate-profiles"]
      });
    }
  });
};

export const useOrderCertificateWithProfile = () => {
  const queryClient = useQueryClient();
  return useMutation<TOrderCertificateResponse, object, TOrderCertificateDTO>({
    mutationFn: async (body) => {
      const { data } = await apiRequest.post<TOrderCertificateResponse>(
        "/api/v1/cert-manager/certificates/order-certificate",
        body
      );
      return data;
    },
    onSuccess: (_, { projectSlug }) => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.forProjectCertificates(projectSlug)
      });
    }
  });
};

export const useRenewCa = () => {
  const queryClient = useQueryClient();
  return useMutation<TRenewCaResponse, object, TRenewCaDTO>({
    mutationFn: async (body) => {
      const { data } = await apiRequest.post<TRenewCaResponse>(
        `/api/v1/cert-manager/ca/internal/${body.caId}/renew`,
        body
      );
      return data;
    },
    onSuccess: ({ projectId }, { caId }) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.getProjectCas({ projectId }) });
      queryClient.invalidateQueries({ queryKey: caKeys.getCaById(caId) });
      queryClient.invalidateQueries({ queryKey: caKeys.getCaCert(caId) });
      queryClient.invalidateQueries({ queryKey: caKeys.getCaCerts(caId) });
      queryClient.invalidateQueries({ queryKey: caKeys.getCaCsr(caId) });
      queryClient.invalidateQueries({ queryKey: caKeys.getCaCrl(caId) });
    }
  });
};
