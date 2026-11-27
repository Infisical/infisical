import { WorkflowIntegration } from "../models/workflow-integration";

// The legacy response shapes, field for field.

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
