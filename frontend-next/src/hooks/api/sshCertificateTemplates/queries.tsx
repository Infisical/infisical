import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TSshCertificateTemplate } from "./types";

export const certTemplateKeys = {
  getSshCertTemplateById: (id: string) => [{ id }, "ssh-cert-template"]
};

export const useGetSshCertTemplate = (id: string) => {
  return useQuery({
    queryKey: certTemplateKeys.getSshCertTemplateById(id),
    queryFn: async () => {
      const { data: certificateTemplate } = await apiRequest.get<TSshCertificateTemplate>(
        `/api/v1/ssh/certificate-templates/${id}`
      );
      return certificateTemplate;
    },
    enabled: Boolean(id)
  });
};
