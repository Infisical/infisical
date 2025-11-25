import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TCertificateTemplate,
  TCertificateTemplateV2,
  TCertificateTemplateV2WithPolicies,
  TEstConfig,
  TGetCertificateTemplateV2ByIdDTO,
  TListCertificateTemplatesDTO,
  TListCertificateTemplatesV2DTO
} from "./types";

export const certTemplateKeys = {
  getCertTemplateById: (id: string) => [{ id }, "cert-template"],
  listTemplates: ({ projectId, ...el }: { limit?: number; offset?: number; projectId: string }) => [
    "list-template",
    projectId,
    el
  ],
  getEstConfig: (id: string) => [{ id }, "cert-template-est-config"],
  listTemplatesV2: ({
    projectId,
    ...el
  }: {
    limit?: number;
    offset?: number;
    projectId: string;
  }) => ["list-templates-v2", projectId, el],
  getTemplateV2ById: (id: string) => ["cert-template-v2", id]
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
      }>("/api/v1/pki/certificate-templates", {
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

export const useListCertificateTemplatesV2 = ({
  projectId,
  limit = 20,
  offset = 0
}: TListCertificateTemplatesV2DTO) => {
  return useQuery({
    queryKey: certTemplateKeys.listTemplatesV2({ projectId, limit, offset }),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        certificateTemplates: TCertificateTemplateV2WithPolicies[];
        totalCount: number;
      }>("/api/v1/cert-manager/certificate-templates", {
        params: {
          projectId,
          limit,
          offset
        }
      });
      return data;
    },
    enabled: Boolean(projectId)
  });
};

export const useGetCertificateTemplateV2ById = ({
  templateId
}: TGetCertificateTemplateV2ByIdDTO) => {
  return useQuery({
    queryKey: certTemplateKeys.getTemplateV2ById(templateId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        certificateTemplate: TCertificateTemplateV2WithPolicies;
      }>(`/api/v1/cert-manager/certificate-templates/${templateId}`);
      return data.certificateTemplate;
    },
    enabled: Boolean(templateId)
  });
};
