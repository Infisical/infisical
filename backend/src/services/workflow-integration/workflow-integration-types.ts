import { TOrgPermission } from "@app/lib/types";

export enum WorkflowIntegration {
  SLACK = "slack"
}

export type TGetWorkflowIntegrationsByOrg = Omit<TOrgPermission, "orgId">;
