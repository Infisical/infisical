import { z } from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { CreateGitHubConnectionSchema, GitHubAppConnectionSchema } from "./github-connection-schemas";

export type TGitHubConnectionConfig = DiscriminativePick<TGitHubConnectionInput, "method" | "app" | "credentials">;

export type TGitHubConnection = z.infer<typeof GitHubAppConnectionSchema>;

export type TGitHubConnectionInput = z.infer<typeof CreateGitHubConnectionSchema> & {
  app: AppConnection.GitHub;
};
