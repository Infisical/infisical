import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { caKeys } from "../ca/queries";
import { projectKeys } from "../projects";
import { certTemplateKeys } from "./queries";
import {
  TCertificateTemplate,
  TCreateCertificateTemplateDTO,
  TCreateCertificateTemplateV2DTO,
  TCreateEstConfigDTO,
  TDeleteCertificateTemplateDTO,
  TDeleteCertificateTemplateV2DTO,
  TUpdateCertificateTemplateDTO,
  TUpdateCertificateTemplateV2DTO,
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
