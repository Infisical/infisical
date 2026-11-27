import type { FastifyRequest } from "fastify";

// The audit events these routes record. The values are the audit catalog's event types, which customer SIEMs key on,
// so they never change; the mount site maps each one onto the catalog and fails to compile when one is missing.
export enum WorkflowIntegrationAuditEvent {
  AttemptCreateSlackIntegration = "attempt-create-slack-integration",
  AttemptReinstallSlackIntegration = "attempt-reinstall-slack-integration",
  DeleteSlackIntegration = "delete-slack-integration",
  GetSlackIntegration = "get-slack-integration",
  UpdateSlackIntegration = "update-slack-integration",
  CheckMicrosoftTeamsInstallationStatus = "microsoft-teams-workflow-integration-check-installation-status",
  CreateMicrosoftTeamsIntegration = "microsoft-teams-workflow-integration-create",
  DeleteMicrosoftTeamsIntegration = "microsoft-teams-workflow-integration-delete",
  GetMicrosoftTeamsIntegration = "microsoft-teams-workflow-integration-get",
  GetMicrosoftTeamsTeams = "microsoft-teams-workflow-integration-get-teams",
  ListMicrosoftTeamsIntegrations = "microsoft-teams-workflow-integration-list",
  UpdateMicrosoftTeamsIntegration = "microsoft-teams-workflow-integration-update"
}

export type TWorkflowIntegrationAuditEntry = {
  // The integration's org; the request's org when left out.
  orgId?: string;
  type: WorkflowIntegrationAuditEvent;
  metadata: Record<string, unknown>;
};

export type TWorkflowIntegrationAuditLog = {
  // Records the event for the request's actor.
  record(req: FastifyRequest, entry: TWorkflowIntegrationAuditEntry): Promise<void>;
};
