import { z } from "zod";

import { TGitLabConnection } from "@app/services/app-connection/gitlab";

import {
  CreateGitLabDataSourceSchema,
  GitLabDataSourceListItemSchema,
  GitLabDataSourceSchema
} from "./gitlab-secret-scanning-schemas";

export type TGitLabDataSource = z.infer<typeof GitLabDataSourceSchema>;

export type TGitLabDataSourceInput = z.infer<typeof CreateGitLabDataSourceSchema>;

export type TGitLabDataSourceListItem = z.infer<typeof GitLabDataSourceListItemSchema>;

export type TGitLabDataSourceWithConnection = TGitLabDataSource & {
  connection: TGitLabConnection;
};
