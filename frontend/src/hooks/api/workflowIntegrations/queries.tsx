import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { SlackIntegration } from "./types";

export const workflowIntegrationKeys = {
  getSlackWorkflowIntegrations: (orgId?: string) => [{ orgId }, "slack-workflow-integrations"],
  getSlackWorkflowIntegration: (id?: string) => [{ id }, "slack-workflow-integration"]
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

export const useGetSlackIntegrations = (orgId?: string) =>
  useQuery({
    queryKey: workflowIntegrationKeys.getSlackWorkflowIntegrations(orgId),
    queryFn: () => fetchSlackIntegrations(),
    enabled: Boolean(orgId)
  });

export const useGetSlackIntegrationById = (id?: string) =>
  useQuery({
    queryKey: workflowIntegrationKeys.getSlackWorkflowIntegration(id),
    queryFn: () => fetchSlackIntegrationById(id),
    enabled: Boolean(id)
  });
