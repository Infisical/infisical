import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { workspaceKeys } from "../workspace";
import { TCertificate, TDeleteCertDTO, TRevokeCertDTO } from "./types";

export const useDeleteCert = () => {
  const queryClient = useQueryClient();
  return useMutation<TCertificate, {}, TDeleteCertDTO>({
    mutationFn: async ({ serialNumber }) => {
      const {
        data: { certificate }
      } = await apiRequest.delete<{ certificate: TCertificate }>(
        `/api/v1/pki/certificates/${serialNumber}`
      );
      return certificate;
    },
    onSuccess: (_, { projectSlug }) => {
      queryClient.invalidateQueries(workspaceKeys.forWorkspaceCertificates(projectSlug));
    }
  });
};

export const useRevokeCert = () => {
  const queryClient = useQueryClient();
  return useMutation<TCertificate, {}, TRevokeCertDTO>({
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
      queryClient.invalidateQueries(workspaceKeys.forWorkspaceCertificates(projectSlug));
    }
  });
};
