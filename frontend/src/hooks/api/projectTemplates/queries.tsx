import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import {
  TListProjectTemplates,
  TProjectTemplate,
  TProjectTemplateResponse
} from "@app/hooks/api/projectTemplates/types";
import { ProjectType } from "@app/hooks/api/workspace/types";

export const projectTemplateKeys = {
  all: ["project-template"] as const,
  list: (projectType?: ProjectType) =>
    [...projectTemplateKeys.all, "list", ...(projectType ? [projectType] : [])] as const,
  byId: (templateId: string) => [...projectTemplateKeys.all, templateId] as const
};

export const useListProjectTemplates = (
  type?: ProjectType,
  options?: Omit<
    UseQueryOptions<
      TProjectTemplate[],
      unknown,
      TProjectTemplate[],
      ReturnType<typeof projectTemplateKeys.list>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: projectTemplateKeys.list(type),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListProjectTemplates>("/api/v1/project-templates", {
        params: { type }
      });

      return data.projectTemplates;
    },
    ...options
  });
};

export const useGetProjectTemplateById = (
  templateId: string,
  options?: Omit<
    UseQueryOptions<
      TProjectTemplate,
      unknown,
      TProjectTemplate,
      ReturnType<typeof projectTemplateKeys.byId>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: projectTemplateKeys.byId(templateId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TProjectTemplateResponse>(
        `/api/v1/project-templates/${templateId}`
      );

      return data.projectTemplate;
    },
    ...options
  });
};
