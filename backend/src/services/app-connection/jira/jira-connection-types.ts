import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateJiraConnectionSchema,
  JiraConnectionSchema,
  ValidateJiraConnectionCredentialsSchema
} from "./jira-connection-schemas";

export type TJiraConnection = z.infer<typeof JiraConnectionSchema>;

export type TJiraConnectionInput = z.infer<typeof CreateJiraConnectionSchema> & {
  app: AppConnection.Jira;
};

export type TValidateJiraConnectionCredentialsSchema = typeof ValidateJiraConnectionCredentialsSchema;

export type TJiraConnectionConfig = DiscriminativePick<
  TJiraConnectionInput,
  "method" | "app" | "credentials" | "gatewayId" | "gatewayPoolId"
> & {
  orgId: string;
};

export type TJiraUser = {
  // Jira Cloud identifies users by accountId, Jira Data Center by key
  accountId?: string;
  key?: string;
  name?: string;
  emailAddress?: string;
  displayName?: string;
  active?: boolean;
};

export type TJiraIssue = {
  id: string;
  key: string;
  fields: {
    status?: { id: string; name: string } | null;
    project?: { id: string; key: string; name: string } | null;
    issuetype?: { id: string; name: string } | null;
    labels?: string[] | null;
    assignee?: TJiraUser | null;
  };
};

export type TJiraApprovalDecision = "approved" | "declined" | "pending";

export type TJiraApproval = {
  id: string;
  name?: string;
  finalDecision: TJiraApprovalDecision;
  createdDate?: { epochMillis?: number; iso8601?: string };
  completedDate?: { epochMillis?: number; iso8601?: string };
};

export type TJiraNamedOption = { id: string; name: string };
