import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TCertificateTemplate, TEstConfig } from "./types";

export const certTemplateKeys = {
  getCertTemplateById: (id: string) => [{ id }, "cert-template"],
  getEstConfig: (id: string) => [{ id }, "cert-template-est-config"]
};

export const useGetCertTemplate = (id: string) => {
  return useQuery({
    queryKey: certTemplateKeys.getCertTemplateById(id),
    queryFn: async () => {
      const { data: certificateTemplate } = await apiRequest.get<TCertificateTemplate>(
        `/api/v1/pki/certificate-templates/${id}`
      );
      return certificateTemplate;
    },
    enabled: Boolean(id)
  });
};

export const useGetEstConfig = (certificateTemplateId: string) => {
  return useQuery({
    queryKey: certTemplateKeys.getEstConfig(certificateTemplateId),
    queryFn: async () => {
      const { data: estConfig } = await apiRequest.get<TEstConfig>(
        `/api/v1/pki/certificate-templates/${certificateTemplateId}/est-config`
      );

      return estConfig;
    },
    enabled: Boolean(certificateTemplateId)
  });
};
