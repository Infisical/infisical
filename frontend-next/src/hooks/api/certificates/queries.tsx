import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TCertificate } from "./types";

export const certKeys = {
  getCertById: (serialNumber: string) => [{ serialNumber }, "cert"],
  getCertBody: (serialNumber: string) => [{ serialNumber }, "certBody"]
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
