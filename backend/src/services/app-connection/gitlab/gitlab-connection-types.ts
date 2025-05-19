import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateGitLabConnectionSchema,
  GitLabConnectionSchema,
  ValidateGitLabConnectionCredentialsSchema
} from "./gitlab-connection-schemas";

export type TGitLabConnection = z.infer<typeof GitLabConnectionSchema>;

export type TGitLabConnectionInput = z.infer<typeof CreateGitLabConnectionSchema> & {
  app: AppConnection.GitLab;
};

export type TValidateGitLabConnectionCredentialsSchema = typeof ValidateGitLabConnectionCredentialsSchema;

export type TGitLabConnectionConfig = DiscriminativePick<TGitLabConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};
