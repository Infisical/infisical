import { z } from "zod";

import { AuditLogInfo } from "@app/ee/services/audit-log/audit-log-types";
import { OrgServiceActor } from "@app/lib/types";

export type TInitiateGitHubManifestDTO = {
  name: string;
  instanceType: "cloud" | "server";
  githubOrg?: string;
  githubHost?: string;
  installState: string;
  projectId?: string;
  gatewayId?: string;
  gatewayPoolId?: string;
  orgPermission: OrgServiceActor;
};

export type TGitHubManifestStatePayload = {
  jti: string;
  orgId: string;
  projectId: string | null;
  actorId: string;
  actorType: string;
  authMethod: string | null;
  name: string;
  instanceType: "cloud" | "server";
  githubOrg: string;
  githubHost: string;
  gatewayId: string | null;
  gatewayPoolId: string | null;
  installState: string;
};

export type THandleManifestCallbackDTO = {
  code: string;
  state: string;
  auditLogInfo: Pick<AuditLogInfo, "ipAddress" | "userAgent" | "userAgentType">;
};

export type TListGitHubAppsDTO = {
  projectId?: string;
  orgPermission: OrgServiceActor;
};

export type TDeleteGitHubAppDTO = {
  id: string;
  orgPermission: OrgServiceActor;
};

export type TGitHubAppManifestResponse = {
  id: number;
  slug: string;
  client_id: string;
  client_secret: string;
  pem: string;
  html_url: string;
  owner?: {
    login?: string;
  } | null;
};

export const SanitizedGitHubAppSchema = z.object({
  id: z.string().uuid().nullable(),
  orgId: z.string().uuid(),
  projectId: z.string().nullable(),
  name: z.string(),
  appId: z.string(),
  slug: z.string(),
  clientId: z.string().nullable(),
  owner: z.string().nullable(),
  host: z.string().nullable(),
  instanceType: z.enum(["cloud", "server"]).nullable(),
  connectionCount: z.number(),
  createdAt: z.date().nullable(),
  updatedAt: z.date().nullable()
});

export type TSanitizedGitHubApp = z.infer<typeof SanitizedGitHubAppSchema>;
