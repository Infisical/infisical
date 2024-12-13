import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { SlackIntegration, SlackIntegrationChannel, WorkflowIntegration } from "./types";

export const workflowIntegrationKeys = {
  getIntegrations: (orgId?: string) => [{ orgId }, "workflow-integrations"],
  getSlackIntegrations: (orgId?: string) => [{ orgId }, "slack-workflow-integrations"],
  getSlackIntegration: (id?: string) => [{ id }, "slack-workflow-integration"],
  getSlackIntegrationChannels: (id?: string) => [{ id }, "slack-workflow-integration-channels"]
};

export const fetchSlackInstallUrl = async ({
  slug,
  description
}: {
  slug: string;
  description?: string;
}) => {
  const { data } = await apiRequest.get<string>("/api/v1/workflow-integrations/slack/install", {
    params: {
      slug,
      description
    }
  });

  return data;
};

export const fetchSlackReinstallUrl = async ({ id }: { id: string }) => {
  const { data } = await apiRequest.get<string>("/api/v1/workflow-integrations/slack/reinstall", {
    params: {
      id
    }
  });

  return data;
};

export const fetchSlackIntegrations = async () => {
  const { data } = await apiRequest.get<SlackIntegration[]>("/api/v1/workflow-integrations/slack");

  return data;
};

export const fetchSlackIntegrationById = async (id?: string) => {
  const { data } = await apiRequest.get<SlackIntegration>(
    `/api/v1/workflow-integrations/slack/${id}`
  );

  return data;
};

export const fetchSlackIntegrationChannels = async (id?: string) => {
  const { data } = await apiRequest.get<SlackIntegrationChannel[]>(
    `/api/v1/workflow-integrations/slack/${id}/channels`
  );

  return data;
};

export const fetchWorkflowIntegrations = async () => {
  const { data } = await apiRequest.get<WorkflowIntegration[]>("/api/v1/workflow-integrations");

  return data;
};

export const useGetSlackIntegrations = (orgId?: string) =>
  useQuery({
    queryKey: workflowIntegrationKeys.getSlackIntegrations(orgId),
    queryFn: () => fetchSlackIntegrations(),
    enabled: Boolean(orgId)
  });

export const useGetSlackIntegrationById = (id?: string) =>
  useQuery({
    queryKey: workflowIntegrationKeys.getSlackIntegration(id),
    queryFn: () => fetchSlackIntegrationById(id),
    enabled: Boolean(id)
  });

export const useGetSlackIntegrationChannels = (id?: string) =>
  useQuery({
    queryKey: workflowIntegrationKeys.getSlackIntegrationChannels(id),
    queryFn: () => fetchSlackIntegrationChannels(id),
    enabled: Boolean(id)
  });

export const useGetWorkflowIntegrations = (id?: string) =>
  useQuery({
    queryKey: workflowIntegrationKeys.getIntegrations(id),
    queryFn: () => fetchWorkflowIntegrations(),
    enabled: Boolean(id)
  });
