import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateVercelConnectionSchema,
  ValidateVercelConnectionCredentialsSchema,
  VercelConnectionSchema
} from "./vercel-connection-schemas";

export type TVercelConnection = z.infer<typeof VercelConnectionSchema>;

export type TVercelConnectionInput = z.infer<typeof CreateVercelConnectionSchema> & {
  app: AppConnection.Vercel;
};

export type TValidateVercelConnectionCredentialsSchema = typeof ValidateVercelConnectionCredentialsSchema;

export type TVercelConnectionConfig = DiscriminativePick<TVercelConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};

export type VercelTeam = {
  id: string;
  name: string;
  slug: string;
};

export type VercelEnvironment = {
  id: string;
  slug: string;
  type: string;
  target?: string[];
  gitBranch?: string;
  createdAt?: number;
  updatedAt?: number;
};

export type VercelAppMeta = {
  githubCommitRef?: string;
  githubCommitSha?: string;
  githubCommitMessage?: string;
  githubCommitAuthorName?: string;
};

export type VercelDeployment = {
  id: string;
  name: string;
  url: string;
  created: number;
  meta?: VercelAppMeta;
  target?: "production" | "preview" | "development";
};

export type VercelApp = {
  name: string;
  id: string;
  envs?: VercelEnvironment[];
  previewBranches?: string[];
};

export type VercelOrgWithApps = VercelTeam & {
  apps: VercelApp[];
};

export type VercelUserResponse = {
  user: {
    id: string;
    name: string;
    username: string;
  };
};
