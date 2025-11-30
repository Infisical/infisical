import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TCertificate, TCertificateRequestDetails } from "./types";

export const certKeys = {
  getCertById: (serialNumber: string) => [{ serialNumber }, "cert"],
  getCertBody: (serialNumber: string) => [{ serialNumber }, "certBody"],
  getCertBundle: (serialNumber: string) => [{ serialNumber }, "certBundle"],
  getCertificateRequest: (requestId: string, projectSlug: string) => [
    { requestId, projectSlug },
    "certificateRequest"
  ]
};

export const useGetCert = (serialNumber: string) => {
  return useQuery({
    queryKey: certKeys.getCertById(serialNumber),
    queryFn: async () => {
      const {
        data: { certificate }
      } = await apiRequest.get<{ certificate: TCertificate }>(
        `/api/v1/pki/certificates/${serialNumber}`
      );
      return certificate;
    },
    enabled: Boolean(serialNumber)
  });
};

export const useGetCertBody = (serialNumber: string) => {
  return useQuery({
    queryKey: certKeys.getCertBody(serialNumber),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        certificate: string;
        certificateChain: string;
        serialNumber: string;
      }>(`/api/v1/pki/certificates/${serialNumber}/certificate`);
      return data;
    },
    enabled: Boolean(serialNumber)
  });
};

export const useGetCertBundle = (serialNumber: string) => {
  return useQuery({
    queryKey: certKeys.getCertBundle(serialNumber),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        certificate: string;
        certificateChain: string;
        serialNumber: string;
        privateKey: string | null;
      }>(`/api/v1/pki/certificates/${serialNumber}/bundle`);
      return data;
    },
    enabled: Boolean(serialNumber)
  });
};

export const useGetCertificateRequest = (requestId: string, projectSlug: string) => {
  return useQuery({
    queryKey: certKeys.getCertificateRequest(requestId, projectSlug),
    queryFn: async () => {
      const { data } = await apiRequest.get<TCertificateRequestDetails>(
        `/api/v3/pki/certificates/requests/${requestId}`,
        {
          params: { projectSlug }
        }
      );
      return data;
    },
    enabled: Boolean(requestId) && Boolean(projectSlug),
    refetchInterval: (query) => {
      // Only refetch if status is pending
      return query.state.data?.status === "pending" ? 5000 : false;
    }
  });
};
