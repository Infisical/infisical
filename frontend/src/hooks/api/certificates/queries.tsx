import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TCertificate } from "./types";

export const certKeys = {
  getCertById: (certId: string) => [{ certId }, "cert"],
  getCertCert: (certId: string) => [{ certId }, "certCert"]
};

export const useGetCertById = (certId: string) => {
  return useQuery({
    queryKey: certKeys.getCertById(certId),
    queryFn: async () => {
      const {
        data: { certificate }
      } = await apiRequest.get<{ certificate: TCertificate }>(`/api/v1/certificates/${certId}`);
      return certificate;
    },
    enabled: Boolean(certId)
  });
};

export const useGetCertCert = (certId: string) => {
  return useQuery({
    queryKey: certKeys.getCertCert(certId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        certificate: string;
        certificateChain: string;
        serialNumber: string;
      }>(`/api/v1/certificates/${certId}/certificate`);
      return data;
    },
    enabled: Boolean(certId)
  });
};
