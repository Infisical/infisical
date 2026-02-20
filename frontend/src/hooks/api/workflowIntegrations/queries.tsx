import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  MicrosoftTeamsIntegration,
  MicrosoftTeamsIntegrationTeam,
  SlackIntegration,
  SlackIntegrationChannel,
  WorkflowIntegration
} from "./types";

export const workflowIntegrationKeys = {
  getIntegrations: (orgId?: string) => [{ orgId }, "workflow-integrations"],
  getSlackIntegrations: (orgId?: string) => [{ orgId }, "slack-workflow-integrations"],
  getSlackIntegration: (id?: string) => [{ id }, "slack-workflow-integration"],
  getMicrosoftTeamsIntegrations: (orgId?: string) => [
    { orgId },
    "microsoft-teams-workflow-integrations"
  ],
  getMicrosoftTeamsIntegration: (id?: string) => [{ id }, "microsoft-teams-workflow-integration"],
  getMicrosoftTeamsIntegrationTeams: (id?: string) => [
    { id },
    "microsoft-teams-workflow-integration-teams"
  ],
  getSlackIntegrationChannels: (id?: string) => [{ id }, "slack-workflow-integration-channels"],
  getMicrosoftTeamsClientId: () => ["microsoft-teams-client-id"]
};

export const fetchSlackInstallUrl = async ({
  slug,
  description,
  isGovSlack
}: {
  slug: string;
  description?: string;
  isGovSlack?: boolean;
}) => {
  const { data } = await apiRequest.get<string>("/api/v1/workflow-integrations/slack/install", {
    params: {
      slug,
      description,
      isGovSlack
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

export const fetchMicrosoftTeamsIntegrations = async () => {
  const { data } = await apiRequest.get<MicrosoftTeamsIntegration[]>(
    "/api/v1/workflow-integrations/microsoft-teams"
  );

  return data;
};

export const fetchMicrosoftTeamsIntegrationById = async (id?: string) => {
  const { data } = await apiRequest.get<MicrosoftTeamsIntegration>(
    `/api/v1/workflow-integrations/microsoft-teams/${id}`
  );

  return data;
};
export const fetchMicrosoftTeamsIntegrationTeams = async (id?: string) => {
  const { data } = await apiRequest.get<MicrosoftTeamsIntegrationTeam[]>(
    `/api/v1/workflow-integrations/microsoft-teams/${id}/teams`
  );

  return data;
};

export const fetchMicrosoftTeamsClientId = async () => {
  const { data } = await apiRequest.get<{ clientId: string }>(
    "/api/v1/workflow-integrations/microsoft-teams/client-id"
  );

  return data;
};

export const useGetMicrosoftTeamsIntegrations = (orgId?: string) =>
  useQuery({
    queryKey: workflowIntegrationKeys.getMicrosoftTeamsIntegrations(orgId),
    queryFn: () => fetchMicrosoftTeamsIntegrations(),
    enabled: Boolean(orgId)
  });

export const useGetMicrosoftTeamsIntegrationById = (id?: string) =>
  useQuery({
    queryKey: workflowIntegrationKeys.getMicrosoftTeamsIntegration(id),
    queryFn: () => fetchMicrosoftTeamsIntegrationById(id),
    enabled: Boolean(id)
  });

export const useGetMicrosoftTeamsIntegrationTeams = (id?: string) =>
  useQuery({
    queryKey: workflowIntegrationKeys.getMicrosoftTeamsIntegrationTeams(id),
    queryFn: () => fetchMicrosoftTeamsIntegrationTeams(id),
    enabled: Boolean(id)
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

export const useGetMicrosoftTeamsClientId = () =>
  useQuery({
    queryKey: workflowIntegrationKeys.getMicrosoftTeamsClientId(),
    queryFn: () => fetchMicrosoftTeamsClientId(),
    enabled: true
  });
