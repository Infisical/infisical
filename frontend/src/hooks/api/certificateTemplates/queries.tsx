import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TCertificateTemplate } from "./types";

export const certTemplateKeys = {
  getCertTemplateById: (id: string) => [{ id }, "cert-template"]
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
