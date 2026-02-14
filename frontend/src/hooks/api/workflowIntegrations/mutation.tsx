import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { projectKeys } from "../projects/query-keys";
import { workflowIntegrationKeys } from "./queries";
import {
  TCheckMicrosoftTeamsIntegrationInstallationStatusDTO,
  TCreateMicrosoftTeamsIntegrationDTO,
  TDeleteMicrosoftTeamsIntegrationDTO,
  TDeleteProjectWorkflowIntegrationDTO,
  TDeleteSlackIntegrationDTO,
  TUpdateMicrosoftTeamsIntegrationDTO,
  TUpdateProjectWorkflowIntegrationConfigDTO,
  TUpdateSlackIntegrationDTO
} from "./types";

export const useUpdateSlackIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TUpdateSlackIntegrationDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.patch(`/api/v1/workflow-integrations/slack/${dto.id}`, dto);

      return data;
    },
    onSuccess: (_, { orgId, id }) => {
      queryClient.invalidateQueries({ queryKey: workflowIntegrationKeys.getSlackIntegration(id) });
      queryClient.invalidateQueries({
        queryKey: workflowIntegrationKeys.getSlackIntegrations(orgId)
      });
    }
  });
};

export const useUpdateMicrosoftTeamsIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TUpdateMicrosoftTeamsIntegrationDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.patch(
        `/api/v1/workflow-integrations/microsoft-teams/${dto.id}`,
        dto
      );

      return data;
    },
    onSuccess: (_, { orgId, id }) => {
      queryClient.invalidateQueries({
        queryKey: workflowIntegrationKeys.getMicrosoftTeamsIntegration(id)
      });
      queryClient.invalidateQueries({
        queryKey: workflowIntegrationKeys.getMicrosoftTeamsIntegrations(orgId)
      });
      queryClient.invalidateQueries({ queryKey: workflowIntegrationKeys.getIntegrations(orgId) });
    }
  });
};
export const useCreateMicrosoftTeamsIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TCreateMicrosoftTeamsIntegrationDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post("/api/v1/workflow-integrations/microsoft-teams", dto);

      return data;
    },
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({
        queryKey: workflowIntegrationKeys.getMicrosoftTeamsIntegrations(orgId)
      });
      queryClient.invalidateQueries({ queryKey: workflowIntegrationKeys.getIntegrations(orgId) });
    }
  });
};

export const useDeleteSlackIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TDeleteSlackIntegrationDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.delete(`/api/v1/workflow-integrations/slack/${dto.id}`);

      return data;
    },
    onSuccess: (_, { orgId, id }) => {
      queryClient.invalidateQueries({ queryKey: workflowIntegrationKeys.getSlackIntegration(id) });
      queryClient.invalidateQueries({ queryKey: workflowIntegrationKeys.getIntegrations(orgId) });
    }
  });
};

export const useDeleteMicrosoftTeamsIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TDeleteMicrosoftTeamsIntegrationDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.delete(
        `/api/v1/workflow-integrations/microsoft-teams/${dto.id}`
      );

      return data;
    },
    onSuccess: (_, { orgId, id }) => {
      queryClient.invalidateQueries({
        queryKey: workflowIntegrationKeys.getMicrosoftTeamsIntegration(id)
      });
      queryClient.invalidateQueries({
        queryKey: workflowIntegrationKeys.getMicrosoftTeamsIntegrations(orgId)
      });
      queryClient.invalidateQueries({ queryKey: workflowIntegrationKeys.getIntegrations(orgId) });
    }
  });
};

export const useUpdateProjectWorkflowIntegrationConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: TUpdateProjectWorkflowIntegrationConfigDTO) => {
      const { data } = await apiRequest.put(
        `/api/v1/projects/${dto.projectId}/workflow-integration`,
        dto
      );

      return data;
    },
    onSuccess: (_, { projectId: workspaceId, integration }) => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectWorkflowIntegrationConfig(workspaceId, integration)
      });
    }
  });
};

export const useDeleteProjectWorkflowIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: TDeleteProjectWorkflowIntegrationDTO) => {
      const { data } = await apiRequest.delete(
        `/api/v1/projects/${dto.projectId}/workflow-integration/${dto.integration}/${dto.integrationId}`
      );

      return data;
    },
    onSuccess: (_, { projectId, integration }) => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectWorkflowIntegrationConfig(projectId, integration)
      });
    }
  });
};

export const useCheckMicrosoftTeamsIntegrationInstallationStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: TCheckMicrosoftTeamsIntegrationInstallationStatusDTO) => {
      const { data } = await apiRequest.post(
        `/api/v1/workflow-integrations/microsoft-teams/${dto.workflowIntegrationId}/installation-status`,
        {}
      );

      return data;
    },
    onSuccess: (_, { workflowIntegrationId, orgId }) => {
      queryClient.invalidateQueries({
        queryKey: workflowIntegrationKeys.getMicrosoftTeamsIntegration(workflowIntegrationId)
      });
      queryClient.invalidateQueries({
        queryKey: workflowIntegrationKeys.getMicrosoftTeamsIntegrations(orgId)
      });
      queryClient.invalidateQueries({ queryKey: workflowIntegrationKeys.getIntegrations(orgId) });
    }
  });
};
