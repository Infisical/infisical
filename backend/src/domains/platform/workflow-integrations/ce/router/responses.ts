import { WorkflowIntegration } from "../models/workflow-integration";

// Response fields are part of the public API; keep each one.

export const toWorkflowIntegrationResponse = (integration: WorkflowIntegration) => ({
  id: integration.id,
  description: integration.description,
  slug: integration.slug,
  integration: integration.provider,
  status: integration.status
});

export const toSlackIntegrationResponse = (integration: WorkflowIntegration) => ({
  id: integration.id,
  description: integration.description,
  slug: integration.slug,
  integration: integration.provider,
  teamName: integration.slackInstallation().teamName
});

export const toMicrosoftTeamsIntegrationResponse = (integration: WorkflowIntegration) => ({
  id: integration.id,
  description: integration.description,
  slug: integration.slug,
  integration: integration.provider,
  tenantId: integration.microsoftTeamsInstallation().tenantId,
  status: integration.status
});
