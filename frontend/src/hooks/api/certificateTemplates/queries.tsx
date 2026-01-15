import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TCertificateTemplate,
  TCertificateTemplateV2,
  TEstConfig,
  TListCertificateTemplatesDTO
} from "./types";

export const certTemplateKeys = {
  getCertTemplateById: (id: string) => [{ id }, "cert-template"],
  listTemplates: ({ projectId, ...el }: { limit?: number; offset?: number; projectId: string }) => [
    "list-template",
    projectId,
    el
  ],
  getEstConfig: (id: string) => [{ id }, "cert-template-est-config"]
};

// TODO: DEPRECATE
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

// TODO: DEPRECATE
export const useListCertificateTemplates = ({
  limit = 100,
  offset = 0,
  projectId
}: TListCertificateTemplatesDTO) => {
  return useQuery({
    queryKey: certTemplateKeys.listTemplates({ limit, offset, projectId }),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        certificateTemplates: TCertificateTemplateV2[];
        totalCount?: number;
      }>("/api/v2/pki/certificate-templates", {
        params: {
          limit,
          offset,
          projectId
        }
      });
      return data;
    }
  });
};

// TODO: DEPRECATE
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
