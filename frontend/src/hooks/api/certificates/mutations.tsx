import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { pkiSubscriberKeys } from "../pkiSubscriber/queries";
import { workspaceKeys } from "../workspace";
import {
  TCertificate,
  TDeleteCertDTO,
  TImportCertificateDTO,
  TImportCertificateResponse,
  TRevokeCertDTO
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
        queryKey: workspaceKeys.forWorkspaceCertificates(projectSlug)
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
        queryKey: workspaceKeys.forWorkspaceCertificates(projectSlug)
      });
      queryClient.invalidateQueries({
        queryKey: pkiSubscriberKeys.allPkiSubscriberCertificates()
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
        queryKey: workspaceKeys.forWorkspaceCertificates(projectSlug)
      });
    }
  });
};
