import { z } from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateGitHubRadarConnectionSchema,
  GitHubRadarConnectionSchema,
  ValidateGitHubRadarConnectionCredentialsSchema
} from "./github-radar-connection-schemas";

export type TGitHubRadarConnection = z.infer<typeof GitHubRadarConnectionSchema>;

export type TGitHubRadarConnectionInput = z.infer<typeof CreateGitHubRadarConnectionSchema> & {
  app: AppConnection.GitHubRadar;
};

export type TValidateGitHubRadarConnectionCredentialsSchema = typeof ValidateGitHubRadarConnectionCredentialsSchema;

export type TGitHubRadarConnectionConfig = DiscriminativePick<
  TGitHubRadarConnectionInput,
  "method" | "app" | "credentials"
>;

export type TGitHubRadarRepository = {
  id: number;
  full_name: string;
};
