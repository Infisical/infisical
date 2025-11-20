import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { pkiSubscriberKeys } from "../pkiSubscriber/queries";
import { projectKeys } from "../projects";
import {
  TCertificate,
  TDeleteCertDTO,
  TDownloadPkcs12DTO,
  TImportCertificateDTO,
  TImportCertificateResponse,
  TRenewCertificateDTO,
  TRenewCertificateResponse,
  TRevokeCertDTO,
  TUpdateRenewalConfigDTO
} from "./types";

export const useDeleteCert = () => {
  const queryClient = useQueryClient();
  return useMutation<TCertificate, object, TDeleteCertDTO>({
    mutationFn: async ({ serialNumber }) => {
      const {
        data: { certificate }
      } = await apiRequest.delete<{ certificate: TCertificate }>(
        `/api/v1/pki/certificates/${serialNumber}`
      );
      return certificate;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["certificate-profiles", "list"]
      });
      queryClient.invalidateQueries({
        queryKey: pkiSubscriberKeys.allPkiSubscriberCertificates()
      });
      queryClient.invalidateQueries({
        queryKey: projectKeys.allProjectCertificates()
      });
      queryClient.invalidateQueries({
        queryKey: projectKeys.forProjectCertificates(projectId)
      });
    }
  });
};

export const useRevokeCert = () => {
  const queryClient = useQueryClient();
  return useMutation<TCertificate, object, TRevokeCertDTO>({
    mutationFn: async ({ serialNumber, revocationReason }) => {
      const {
        data: { certificate }
      } = await apiRequest.post<{ certificate: TCertificate }>(
        `/api/v1/pki/certificates/${serialNumber}/revoke`,
        {
          revocationReason
        }
      );
      return certificate;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["certificate-profiles", "list"]
      });
      queryClient.invalidateQueries({
        queryKey: pkiSubscriberKeys.allPkiSubscriberCertificates()
      });
      queryClient.invalidateQueries({
        queryKey: projectKeys.allProjectCertificates()
      });
      queryClient.invalidateQueries({
        queryKey: projectKeys.forProjectCertificates(projectId)
      });
    }
  });
};

export const useImportCertificate = () => {
  const queryClient = useQueryClient();
  return useMutation<TImportCertificateResponse, object, TImportCertificateDTO>({
    mutationFn: async (body) => {
      const { data } = await apiRequest.post<TImportCertificateResponse>(
        "/api/v1/pki/certificates/import-certificate",
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

export const useRenewCertificate = () => {
  const queryClient = useQueryClient();
  return useMutation<TRenewCertificateResponse, object, TRenewCertificateDTO>({
    mutationFn: async ({ certificateId }) => {
      const { data } = await apiRequest.post<TRenewCertificateResponse>(
        `/api/v3/pki/certificates/${certificateId}/renew`,
        {}
      );
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["certificate-profiles", "list"]
      });
      queryClient.invalidateQueries({
        queryKey: pkiSubscriberKeys.allPkiSubscriberCertificates()
      });
      queryClient.invalidateQueries({
        queryKey: projectKeys.allProjectCertificates()
      });
      if (data.projectId) {
        queryClient.invalidateQueries({
          queryKey: projectKeys.forProjectCertificates(data.projectId)
        });
      }
    }
  });
};

export const useUpdateRenewalConfig = () => {
  const queryClient = useQueryClient();
  return useMutation<
    { message: string; renewBeforeDays?: number },
    object,
    TUpdateRenewalConfigDTO
  >({
    mutationFn: async ({ certificateId, renewBeforeDays, enableAutoRenewal }) => {
      const { data } = await apiRequest.patch<{ message: string; renewBeforeDays?: number }>(
        `/api/v3/pki/certificates/${certificateId}/config`,
        { renewBeforeDays, enableAutoRenewal }
      );
      return data;
    },
    onSuccess: (_, { projectSlug }) => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.forProjectCertificates(projectSlug)
      });
      queryClient.invalidateQueries({
        queryKey: projectKeys.allProjectCertificates()
      });
    }
  });
};

export const useDownloadCertPkcs12 = () => {
  return useMutation<void, object, TDownloadPkcs12DTO>({
    mutationFn: async ({ serialNumber, projectSlug, password, alias }) => {
      try {
        const response = await apiRequest.post(
          `/api/v1/pki/certificates/${serialNumber}/pkcs12`,
          {
            password,
            alias
          },
          {
            params: { projectSlug },
            responseType: "arraybuffer"
          }
        );

        // Create blob and trigger download
        const blob = new Blob([response.data], { type: "application/octet-stream" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `certificate-${serialNumber}.p12`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } catch (error: any) {
        if (error.response?.data instanceof ArrayBuffer) {
          const decoder = new TextDecoder();
          const errorText = decoder.decode(error.response.data);
          const errorData = JSON.parse(errorText);
          throw new Error(errorData.message);
        }
        throw error;
      }
    }
  });
};
