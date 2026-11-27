import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateLinearConnectionSchema,
  LinearConnectionSchema,
  ValidateLinearConnectionCredentialsSchema
} from "./linear-connection-schemas";

export type TLinearConnection = z.infer<typeof LinearConnectionSchema>;

export type TLinearConnectionInput = z.infer<typeof CreateLinearConnectionSchema> & {
  app: AppConnection.Linear;
};

export type TValidateLinearConnectionCredentialsSchema = typeof ValidateLinearConnectionCredentialsSchema;

export type TLinearConnectionConfig = DiscriminativePick<TLinearConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};

export type TLinearUser = {
  id?: string | null;
  name?: string | null;
  displayName?: string | null;
  email?: string | null;
  active?: boolean | null;
};

export type TLinearComment = {
  id?: string | null;
  body?: string | null;
  createdAt?: string | null;
  user?: TLinearUser | null;
};

type TLinearCommentPage = { nodes: TLinearComment[]; pageInfo?: { hasNextPage?: boolean } };

export type TLinearIssueWithCommentPages = Omit<TLinearIssue, "comments" | "hasMoreComments"> & {
  commentsFirst?: TLinearCommentPage | null;
  commentsLast?: TLinearCommentPage | null;
};

export type TLinearIssue = {
  id: string;
  identifier: string;
  archivedAt?: string | null;
  trashed?: boolean | null;
  url?: string | null;
  title?: string | null;
  description?: string | null;
  priorityLabel?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  state?: { name: string; type?: string | null } | null;
  team?: { key: string; name: string } | null;
  project?: { name: string } | null;
  assignee?: TLinearUser | null;
  creator?: TLinearUser | null;
  labels?: { nodes: { name: string }[] } | null;
  comments?: { nodes: TLinearComment[] } | null;
  hasMoreComments?: boolean;
};

export type TLinearTeam = { key: string; name: string };

export type TLinearHistoryEntry = {
  id?: string | null;
  createdAt?: string | null;
  actor?: TLinearUser | null;
  botActor?: { name?: string | null } | null;
  fromStateId?: string | null;
  toStateId?: string | null;
  fromAssigneeId?: string | null;
  toAssigneeId?: string | null;
};

export type TLinearIssueHistory = { entries: TLinearHistoryEntry[]; complete: boolean };
