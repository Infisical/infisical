import z from "zod";

import { TJenkinsConnection } from "@app/services/app-connection/jenkins";

import { CreateJenkinsSyncSchema, JenkinsSyncListItemSchema, JenkinsSyncSchema } from "./jenkins-sync-schemas";

export type TJenkinsSyncListItem = z.infer<typeof JenkinsSyncListItemSchema>;

export type TJenkinsSync = z.infer<typeof JenkinsSyncSchema>;

export type TJenkinsSyncInput = z.infer<typeof CreateJenkinsSyncSchema>;

export type TJenkinsSyncWithCredentials = TJenkinsSync & {
  connection: TJenkinsConnection;
};

export type TJenkinsCredential = {
  id: string;
  typeName?: string;
};
