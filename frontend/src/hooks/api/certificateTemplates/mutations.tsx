import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { caKeys } from "../ca/queries";
import { workspaceKeys } from "../workspace";
import { certTemplateKeys } from "./queries";
import {
  TCertificateTemplate,
  TCreateCertificateTemplateDTO,
  TCreateEstConfigDTO,
  TDeleteCertificateTemplateDTO,
  TUpdateCertificateTemplateDTO,
  TUpdateEstConfigDTO
} from "./types";

export const useCreateCertTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation<TCertificateTemplate, {}, TCreateCertificateTemplateDTO>({
    mutationFn: async (data) => {
      const { data: certificateTemplate } = await apiRequest.post<TCertificateTemplate>(
        "/api/v1/pki/certificate-templates",
        data
      );
      return certificateTemplate;
    },
    onSuccess: ({ caId }, { projectId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceCertificateTemplates(projectId));
      queryClient.invalidateQueries(caKeys.getCaCertTemplates(caId));
    }
  });
};

export const useUpdateCertTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation<TCertificateTemplate, {}, TUpdateCertificateTemplateDTO>({
    mutationFn: async (data) => {
      const { data: certificateTemplate } = await apiRequest.patch<TCertificateTemplate>(
        `/api/v1/pki/certificate-templates/${data.id}`,
        data
      );

      return certificateTemplate;
    },
    onSuccess: ({ caId }, { projectId, id }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceCertificateTemplates(projectId));
      queryClient.invalidateQueries(certTemplateKeys.getCertTemplateById(id));
      queryClient.invalidateQueries(caKeys.getCaCertTemplates(caId));
    }
  });
};

export const useDeleteCertTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation<TCertificateTemplate, {}, TDeleteCertificateTemplateDTO>({
    mutationFn: async (data) => {
      const { data: certificateTemplate } = await apiRequest.delete<TCertificateTemplate>(
        `/api/v1/pki/certificate-templates/${data.id}`
      );
      return certificateTemplate;
    },
    onSuccess: ({ caId }, { projectId, id }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceCertificateTemplates(projectId));
      queryClient.invalidateQueries(certTemplateKeys.getCertTemplateById(id));
      queryClient.invalidateQueries(caKeys.getCaCertTemplates(caId));
    }
  });
};

export const useCreateEstConfig = () => {
  const queryClient = useQueryClient();
  return useMutation<{}, {}, TCreateEstConfigDTO>({
    mutationFn: async (body) => {
      const { data } = await apiRequest.post(
        `/api/v1/pki/certificate-templates/${body.certificateTemplateId}/est-config`,
        body
      );
      return data;
    },
    onSuccess: (_, { certificateTemplateId }) => {
      queryClient.invalidateQueries(certTemplateKeys.getEstConfig(certificateTemplateId));
    }
  });
};

export const useUpdateEstConfig = () => {
  const queryClient = useQueryClient();
  return useMutation<{}, {}, TUpdateEstConfigDTO>({
    mutationFn: async (body) => {
      const { data } = await apiRequest.patch(
        `/api/v1/pki/certificate-templates/${body.certificateTemplateId}/est-config`,
        body
      );
      return data;
    },
    onSuccess: (_, { certificateTemplateId }) => {
      queryClient.invalidateQueries(certTemplateKeys.getEstConfig(certificateTemplateId));
    }
  });
};
