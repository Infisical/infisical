import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { sshCaKeys } from "../sshCa/queries";
import {
  TCreateSshCertificateTemplateDTO,
  TDeleteSshCertificateTemplateDTO,
  TSshCertificateTemplate,
  TUpdateSshCertificateTemplateDTO
} from "./types";

export const useCreateSshCertTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation<TSshCertificateTemplate, object, TCreateSshCertificateTemplateDTO>({
    mutationFn: async (data) => {
      const { data: certificateTemplate } = await apiRequest.post<TSshCertificateTemplate>(
        "/api/v1/ssh/certificate-templates",
        data
      );
      return certificateTemplate;
    },
    onSuccess: ({ sshCaId }) => {
      queryClient.invalidateQueries({ queryKey: sshCaKeys.getSshCaCertTemplates(sshCaId) });
    }
  });
};

export const useUpdateSshCertTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation<TSshCertificateTemplate, object, TUpdateSshCertificateTemplateDTO>({
    mutationFn: async (data) => {
      const { data: certificateTemplate } = await apiRequest.patch<TSshCertificateTemplate>(
        `/api/v1/ssh/certificate-templates/${data.id}`,
        data
      );

      return certificateTemplate;
    },
    onSuccess: ({ sshCaId }) => {
      queryClient.invalidateQueries({ queryKey: sshCaKeys.getSshCaCertTemplates(sshCaId) });
    }
  });
};

export const useDeleteSshCertTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation<TSshCertificateTemplate, object, TDeleteSshCertificateTemplateDTO>({
    mutationFn: async (data) => {
      const { data: certificateTemplate } = await apiRequest.delete<TSshCertificateTemplate>(
        `/api/v1/ssh/certificate-templates/${data.id}`
      );
      return certificateTemplate;
    },
    onSuccess: ({ sshCaId }) => {
      queryClient.invalidateQueries({ queryKey: sshCaKeys.getSshCaCertTemplates(sshCaId) });
    }
  });
};
