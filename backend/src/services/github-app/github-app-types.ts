import { z } from "zod";

import { AuditLogInfo } from "@app/ee/services/audit-log/audit-log-types";
import { OrgServiceActor } from "@app/lib/types";

export type TInitiateGitHubManifestDTO = {
  name: string;
  instanceType: "cloud" | "server";
  githubOrg?: string;
  githubHost?: string;
  installState: string;
  orgPermission: OrgServiceActor;
};

export type TGitHubManifestStatePayload = {
  jti: string;
  orgId: string;
  actorId: string;
  actorType: string;
  authMethod: string | null;
  name: string;
  instanceType: "cloud" | "server";
  githubOrg: string;
  githubHost: string;
  installState: string;
};

export type THandleManifestCallbackDTO = {
  code: string;
  state: string;
  auditLogInfo: Pick<AuditLogInfo, "ipAddress" | "userAgent" | "userAgentType">;
};

export type TListGitHubAppsDTO = {
  orgPermission: OrgServiceActor;
};

export type TDeleteGitHubAppDTO = {
  id: string;
  orgPermission: OrgServiceActor;
};

export type TResolveGitHubAppInstallationsDTO = {
  code: string;
  gitHubAppId?: string;
  host?: string;
  instanceType?: "cloud" | "server";
  gatewayId?: string | null;
  projectId?: string;
  orgPermission: OrgServiceActor;
};

export type TGitHubAppInstallation = {
  id: string;
  accountLogin: string;
  accountType: string;
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
  name: z.string(),
  appId: z.string(),
  slug: z.string(),
  clientId: z.string().nullable(),
  owner: z.string().nullable(),
  connectionCount: z.number(),
  createdAt: z.date().nullable(),
  updatedAt: z.date().nullable()
});

export type TSanitizedGitHubApp = z.infer<typeof SanitizedGitHubAppSchema>;
