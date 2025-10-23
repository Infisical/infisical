import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { pkiSubscriberKeys } from "../pkiSubscriber/queries";
import { projectKeys } from "../projects";
import {
  TCertificate,
  TDeleteCertDTO,
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
    onSuccess: (_, { projectSlug }) => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.forProjectCertificates(projectSlug)
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
    onSuccess: (_, { projectSlug }) => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.forProjectCertificates(projectSlug)
      });
      queryClient.invalidateQueries({
        queryKey: pkiSubscriberKeys.allPkiSubscriberCertificates()
      });

      queryClient.invalidateQueries({
        queryKey: ["certificate-profiles", "list"]
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
        `/api/v3/certificates/${certificateId}/renew`,
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
    TUpdateRenewalConfigDTO & { disableAutoRenewal?: boolean }
  >({
    mutationFn: async ({ certificateId, renewBeforeDays, disableAutoRenewal }) => {
      const { data } = await apiRequest.patch<{ message: string; renewBeforeDays?: number }>(
        `/api/v3/certificates/${certificateId}/config`,
        { renewBeforeDays, disableAutoRenewal }
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
