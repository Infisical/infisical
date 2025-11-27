import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { caKeys } from "../ca/queries";
import { projectKeys } from "../projects";
import { certTemplateKeys } from "./queries";
import {
  TCertificateTemplate,
  TCertificateTemplateV2WithPolicies,
  TCreateCertificateTemplateDTO,
  TCreateCertificateTemplateV2DTO,
  TCreateCertificateTemplateV2WithPoliciesDTO,
  TCreateEstConfigDTO,
  TDeleteCertificateTemplateDTO,
  TDeleteCertificateTemplateV2DTO,
  TDeleteCertificateTemplateV2WithPoliciesDTO,
  TUpdateCertificateTemplateDTO,
  TUpdateCertificateTemplateV2DTO,
  TUpdateCertificateTemplateV2WithPoliciesDTO,
  TUpdateEstConfigDTO
} from "./types";

// TODO: DEPRECATE
export const useCreateCertTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation<TCertificateTemplate, object, TCreateCertificateTemplateDTO>({
    mutationFn: async (data) => {
      const { data: certificateTemplate } = await apiRequest.post<TCertificateTemplate>(
        "/api/v1/pki/certificate-templates",
        data
      );
      return certificateTemplate;
    },
    onSuccess: ({ caId }, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectCertificateTemplates(projectId)
      });
      queryClient.invalidateQueries({ queryKey: caKeys.getCaCertTemplates(caId) });
    }
  });
};

// TODO: DEPRECATE
export const useUpdateCertTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation<TCertificateTemplate, object, TUpdateCertificateTemplateDTO>({
    mutationFn: async (data) => {
      const { data: certificateTemplate } = await apiRequest.patch<TCertificateTemplate>(
        `/api/v1/pki/certificate-templates/${data.id}`,
        data
      );

      return certificateTemplate;
    },
    onSuccess: ({ caId }, { projectId, id }) => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectCertificateTemplates(projectId)
      });
      queryClient.invalidateQueries({ queryKey: certTemplateKeys.getCertTemplateById(id) });
      queryClient.invalidateQueries({ queryKey: caKeys.getCaCertTemplates(caId) });
    }
  });
};

// TODO: DEPRECATE
export const useDeleteCertTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation<TCertificateTemplate, object, TDeleteCertificateTemplateDTO>({
    mutationFn: async (data) => {
      const { data: certificateTemplate } = await apiRequest.delete<TCertificateTemplate>(
        `/api/v1/pki/certificate-templates/${data.id}`
      );
      return certificateTemplate;
    },
    onSuccess: ({ caId }, { projectId, id }) => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectCertificateTemplates(projectId)
      });
      queryClient.invalidateQueries({ queryKey: certTemplateKeys.getCertTemplateById(id) });
      queryClient.invalidateQueries({ queryKey: caKeys.getCaCertTemplates(caId) });
    }
  });
};

export const useCreateCertTemplateV2 = () => {
  const queryClient = useQueryClient();
  return useMutation<TCertificateTemplate, object, TCreateCertificateTemplateV2DTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post<{
        certificateTemplate: TCertificateTemplate;
      }>("/api/v2/pki/certificate-templates", dto);
      return data.certificateTemplate;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const [firstKey, queryProjectId] = query.queryKey;
          return firstKey === "list-template" && queryProjectId === projectId;
        }
      });
    }
  });
};

export const useUpdateCertTemplateV2 = () => {
  const queryClient = useQueryClient();
  return useMutation<TCertificateTemplate, object, TUpdateCertificateTemplateV2DTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.patch<{ certificateTemplate: TCertificateTemplate }>(
        `/api/v2/pki/certificate-templates/${dto.templateName}`,
        dto
      );

      return data.certificateTemplate;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const [firstKey, queryProjectId] = query.queryKey;
          return firstKey === "list-template" && queryProjectId === projectId;
        }
      });
    }
  });
};

export const useDeleteCertTemplateV2 = () => {
  const queryClient = useQueryClient();
  return useMutation<TCertificateTemplate, object, TDeleteCertificateTemplateV2DTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.delete<{ certificateTemplate: TCertificateTemplate }>(
        `/api/v2/pki/certificate-templates/${dto.templateName}`,
        {
          data: {
            projectId: dto.projectId
          }
        }
      );
      return data.certificateTemplate;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const [firstKey, queryProjectId] = query.queryKey;
          return firstKey === "list-template" && queryProjectId === projectId;
        }
      });
    }
  });
};

// TODO: DEPRECATE
export const useCreateEstConfig = () => {
  const queryClient = useQueryClient();
  return useMutation<object, object, TCreateEstConfigDTO>({
    mutationFn: async (body) => {
      const { data } = await apiRequest.post(
        `/api/v1/pki/certificate-templates/${body.certificateTemplateId}/est-config`,
        body
      );
      return data;
    },
    onSuccess: (_, { certificateTemplateId }) => {
      queryClient.invalidateQueries({
        queryKey: certTemplateKeys.getEstConfig(certificateTemplateId)
      });
    }
  });
};

// TODO: DEPRECATE
export const useUpdateEstConfig = () => {
  const queryClient = useQueryClient();
  return useMutation<object, object, TUpdateEstConfigDTO>({
    mutationFn: async (body) => {
      const { data } = await apiRequest.patch(
        `/api/v1/pki/certificate-templates/${body.certificateTemplateId}/est-config`,
        body
      );
      return data;
    },
    onSuccess: (_, { certificateTemplateId }) => {
      queryClient.invalidateQueries({
        queryKey: certTemplateKeys.getEstConfig(certificateTemplateId)
      });
    }
  });
};

export const useCreateCertificateTemplateV2WithPolicies = () => {
  const queryClient = useQueryClient();
  return useMutation<
    TCertificateTemplateV2WithPolicies,
    object,
    TCreateCertificateTemplateV2WithPoliciesDTO
  >({
    mutationFn: async (data) => {
      const { data: response } = await apiRequest.post<{
        certificateTemplate: TCertificateTemplateV2WithPolicies;
      }>("/api/v1/cert-manager/certificate-templates", data);
      return response.certificateTemplate;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: certTemplateKeys.listTemplatesV2({ projectId })
      });
    }
  });
};

export const useUpdateCertificateTemplateV2WithPolicies = () => {
  const queryClient = useQueryClient();
  return useMutation<
    TCertificateTemplateV2WithPolicies,
    object,
    TUpdateCertificateTemplateV2WithPoliciesDTO
  >({
    mutationFn: async ({ templateId, ...data }) => {
      const { data: response } = await apiRequest.patch<{
        certificateTemplate: TCertificateTemplateV2WithPolicies;
      }>(`/api/v1/cert-manager/certificate-templates/${templateId}`, data);
      return response.certificateTemplate;
    },
    onSuccess: (template, { templateId }) => {
      queryClient.invalidateQueries({
        queryKey: certTemplateKeys.listTemplatesV2({ projectId: template.projectId })
      });
      queryClient.invalidateQueries({
        queryKey: certTemplateKeys.getTemplateV2ById(templateId)
      });
    }
  });
};

export const useDeleteCertificateTemplateV2WithPolicies = () => {
  const queryClient = useQueryClient();
  return useMutation<
    TCertificateTemplateV2WithPolicies,
    object,
    TDeleteCertificateTemplateV2WithPoliciesDTO
  >({
    mutationFn: async ({ templateId }) => {
      const { data: response } = await apiRequest.delete<{
        certificateTemplate: TCertificateTemplateV2WithPolicies;
      }>(`/api/v1/cert-manager/certificate-templates/${templateId}`);
      return response.certificateTemplate;
    },
    onSuccess: (template, { templateId }) => {
      queryClient.invalidateQueries({
        queryKey: certTemplateKeys.listTemplatesV2({ projectId: template.projectId })
      });
      queryClient.removeQueries({
        queryKey: certTemplateKeys.getTemplateV2ById(templateId)
      });
    }
  });
};
