import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  GetIdentityAuthTemplatesDTO,
  GetTemplateUsagesDTO,
  IdentityAuthTemplate,
  MachineAuthTemplateUsage,
  MachineIdentityAuthMethod
} from "./types";

export const identityAuthTemplatesKeys = {
  all: ["identity-auth-templates"] as const,
  getTemplates: (dto: GetIdentityAuthTemplatesDTO) =>
    [...identityAuthTemplatesKeys.all, "list", dto] as const,
  getTemplate: (templateId: string) =>
    [...identityAuthTemplatesKeys.all, "single", templateId] as const,
  getAvailableTemplates: (authMethod: MachineIdentityAuthMethod) =>
    [...identityAuthTemplatesKeys.all, "available", authMethod] as const,
  getTemplateUsages: (templateId: string) =>
    [...identityAuthTemplatesKeys.all, "usages", templateId] as const
};

export const useGetIdentityAuthTemplates = (dto: GetIdentityAuthTemplatesDTO) => {
  return useQuery({
    queryKey: identityAuthTemplatesKeys.getTemplates(dto),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        templates: IdentityAuthTemplate[];
        totalCount: number;
      }>("/api/v1/identities/templates/search", {
        params: {
          organizationId: dto.organizationId,
          limit: dto.limit || 50,
          offset: dto.offset || 0,
          ...(dto.search && { search: dto.search })
        }
      });
      return data;
    },
    enabled: Boolean(dto.organizationId)
  });
};

export const useGetIdentityAuthTemplate = (templateId: string, organizationId: string) => {
  return useQuery({
    queryKey: identityAuthTemplatesKeys.getTemplate(templateId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ template: IdentityAuthTemplate }>(
        `/api/v1/identities/templates/${templateId}`,
        {
          params: { organizationId }
        }
      );
      return data.template;
    },
    enabled: Boolean(templateId) && Boolean(organizationId)
  });
};

export const useGetAvailableTemplates = (authMethod: MachineIdentityAuthMethod) => {
  return useQuery({
    queryKey: identityAuthTemplatesKeys.getAvailableTemplates(authMethod),
    queryFn: async () => {
      const { data } = await apiRequest.get<IdentityAuthTemplate[]>(
        "/api/v1/identities/templates",
        {
          params: { authMethod }
        }
      );
      return data;
    },
    enabled: Boolean(authMethod)
  });
};

export const useGetTemplateUsages = (dto: GetTemplateUsagesDTO) => {
  return useQuery({
    queryKey: identityAuthTemplatesKeys.getTemplateUsages(dto.templateId),
    queryFn: async () => {
      const { data } = await apiRequest.get<MachineAuthTemplateUsage[]>(
        `/api/v1/identities/templates/${dto.templateId}/usage`,
        {
          params: { organizationId: dto.organizationId }
        }
      );
      return data;
    },
    enabled: Boolean(dto.templateId) && Boolean(dto.organizationId)
  });
};
