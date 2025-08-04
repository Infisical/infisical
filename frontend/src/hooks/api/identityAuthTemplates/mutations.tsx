import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { identityAuthTemplatesKeys } from "./queries";
import {
  CreateIdentityAuthTemplateDTO,
  DeleteIdentityAuthTemplateDTO,
  IdentityAuthTemplate,
  MachineAuthTemplateUsage,
  UnlinkTemplateUsageDTO,
  UpdateIdentityAuthTemplateDTO
} from "./types";

export const useCreateIdentityAuthTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: CreateIdentityAuthTemplateDTO) => {
      const { data } = await apiRequest.post<{ template: IdentityAuthTemplate }>(
        "/api/v1/identity-templates",
        dto
      );
      return data.template;
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: identityAuthTemplatesKeys.getTemplates({ organizationId })
      });
    }
  });
};

export const useUpdateIdentityAuthTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: UpdateIdentityAuthTemplateDTO) => {
      const { data } = await apiRequest.patch<{ template: IdentityAuthTemplate }>(
        `/api/v1/identity-templates/${dto.templateId}`,
        dto
      );
      return data.template;
    },
    onSuccess: (_, { organizationId, templateId }) => {
      queryClient.invalidateQueries({
        queryKey: identityAuthTemplatesKeys.getTemplates({ organizationId })
      });
      queryClient.invalidateQueries({
        queryKey: identityAuthTemplatesKeys.getTemplate(templateId)
      });
    }
  });
};

export const useDeleteIdentityAuthTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: DeleteIdentityAuthTemplateDTO) => {
      await apiRequest.delete(`/api/v1/identity-templates/${dto.templateId}`, {
        params: { organizationId: dto.organizationId }
      });
    },
    onSuccess: (_, { organizationId, templateId }) => {
      queryClient.invalidateQueries({
        queryKey: identityAuthTemplatesKeys.getTemplates({ organizationId })
      });
      queryClient.removeQueries({
        queryKey: identityAuthTemplatesKeys.getTemplate(templateId)
      });
    }
  });
};

export const useUnlinkTemplateUsage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: UnlinkTemplateUsageDTO) => {
      const { data } = await apiRequest.post<MachineAuthTemplateUsage[]>(
        `/api/v1/identity-templates/${dto.templateId}/delete-usage`,
        { identityIds: dto.identityIds },
        { params: { organizationId: dto.organizationId } }
      );
      return data;
    },
    onSuccess: (_, { templateId, organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: identityAuthTemplatesKeys.getTemplateUsages(templateId)
      });
      queryClient.invalidateQueries({
        queryKey: identityAuthTemplatesKeys.getTemplates({ organizationId })
      });
    }
  });
};
