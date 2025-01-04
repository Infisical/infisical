import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { projectTemplateKeys } from "@app/hooks/api/projectTemplates/queries";
import {
  TCreateProjectTemplateDTO,
  TDeleteProjectTemplateDTO,
  TProjectTemplateResponse,
  TUpdateProjectTemplateDTO
} from "@app/hooks/api/projectTemplates/types";

export const useCreateProjectTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TCreateProjectTemplateDTO) => {
      const { data } = await apiRequest.post<TProjectTemplateResponse>(
        "/api/v1/project-templates",
        payload
      );

      return data.projectTemplate;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectTemplateKeys.list() })
  });
};

export const useUpdateProjectTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ templateId, ...params }: TUpdateProjectTemplateDTO) => {
      const { data } = await apiRequest.patch<TProjectTemplateResponse>(
        `/api/v1/project-templates/${templateId}`,
        params
      );

      return data.projectTemplate;
    },
    onSuccess: (_, { templateId }) => {
      queryClient.invalidateQueries({ queryKey: projectTemplateKeys.list() });
      queryClient.invalidateQueries({ queryKey: projectTemplateKeys.byId(templateId) });
    }
  });
};

export const useDeleteProjectTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ templateId }: TDeleteProjectTemplateDTO) => {
      const { data } = await apiRequest.delete(`/api/v1/project-templates/${templateId}`);

      return data;
    },
    onSuccess: (_, { templateId }) => {
      queryClient.invalidateQueries({ queryKey: projectTemplateKeys.list() });
      queryClient.invalidateQueries({ queryKey: projectTemplateKeys.byId(templateId) });
    }
  });
};
