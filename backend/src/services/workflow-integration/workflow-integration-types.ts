import { TActorInput } from "@app/lib/types";

export enum WorkflowIntegration {
  SLACK = "slack",
  MICROSOFT_TEAMS = "microsoft-teams"
}

export enum WorkflowIntegrationStatus {
  PENDING = "pending",
  INSTALLED = "installed"
}

export type TGetWorkflowIntegrationsByOrg = TActorInput;
