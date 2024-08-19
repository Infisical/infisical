import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { workspaceKeys } from "../workspace/queries";
import { certTemplateKeys } from "./queries";
import {
  TCertificateTemplate,
  TCreateCertificateTemplateDTO,
  TDeleteCertificateTemplateDTO,
  TUpdateCertificateTemplateDTO
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
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceCertificateTemplates(projectId));
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
    onSuccess: (_, { projectId, id }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceCertificateTemplates(projectId));
      queryClient.invalidateQueries(certTemplateKeys.getCertTemplateById(id));
    }
  });
};

export const useDeleteCertTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation<void, {}, TDeleteCertificateTemplateDTO>({
    mutationFn: async (data) => {
      return apiRequest.delete(`/api/v1/pki/certificate-templates/${data.id}`);
    },
    onSuccess: (_, { projectId, id }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceCertificateTemplates(projectId));
      queryClient.invalidateQueries(certTemplateKeys.getCertTemplateById(id));
    }
  });
};
