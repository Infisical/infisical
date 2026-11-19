import { FastifyRequest } from "fastify";

import { TOauthVariableConnected } from "@app/ee/services/agent-vault-oauth/agent-vault-oauth-service";
import {
  AgentVaultHttpMethod,
  AgentVaultMcpTransport,
  AgentVaultServiceType,
  AgentVaultVariableType
} from "@app/ee/services/agent-vault/agent-vault-enums";
import { TAgentVaultServiceTypeFields } from "@app/ee/services/agent-vault/agent-vault-service-type-fns";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { BadRequestError } from "@app/lib/errors";
import { pick } from "@app/lib/fn";
import { TGenericPermission } from "@app/lib/types";
import { emitAgentVaultTelemetry } from "@app/server/lib/telemetry";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export const actorContext = (req: FastifyRequest): TGenericPermission => ({
  actorId: req.permission.id,
  actor: req.permission.type,
  actorOrgId: req.permission.orgId,
  actorAuthMethod: req.permission.authMethod
});

// Zod validation strips keys a schema does not declare, so a body projectId on a route that reads the query is
// recorded before validation by the preValidation hook in registerAgentVaultRouters.
const requestsWithBodyProjectId = new WeakSet<FastifyRequest>();

export const recordBodyProjectId = (req: FastifyRequest) => {
  const { body } = req;
  if (body && typeof body === "object" && !Array.isArray(body) && Object.hasOwn(body, "projectId")) {
    requestsWithBodyProjectId.add(req);
  }
};

const hasQueryProjectId = (req: FastifyRequest) => {
  const queryString = req.raw.url?.split("?")[1];
  return queryString ? new URLSearchParams(queryString).has("projectId") : false;
};

// The project a list, create or project-level request acts on: the projectId it sent, checked against the caller's
// org, or the temporary fallback for clients that predate projects. A projectId sent where the route does not read
// it would otherwise be ignored and the request would act on the fallback project. This check goes away together
// with the fallback after 2027-01-04.
export const resolveRequestedProjectId = (
  req: FastifyRequest,
  projectId: string | undefined,
  from: "query" | "body"
) => {
  if (from === "query" && requestsWithBodyProjectId.has(req)) {
    throw new BadRequestError({ message: "This route reads projectId from the query string" });
  }
  if (from === "body" && hasQueryProjectId(req)) {
    throw new BadRequestError({ message: "This route reads projectId from the request body" });
  }

  return req.server.services.agentVaultProjectResolver.resolve(req.permission.orgId, projectId, {
    route: `${req.method} ${req.routeOptions.url ?? ""}`,
    actorId: req.permission.id,
    actorType: req.permission.type,
    userAgent: req.headers["user-agent"]
  });
};

type TServiceTypeReportFields = {
  serverUrl?: string;
  transport?: AgentVaultMcpTransport;
  host?: string;
  port?: number;
  database?: string;
  tlsEnabled?: boolean;
  tlsVerify?: boolean;
  hasTlsCa?: boolean;
  hostPattern?: string;
  allowedMethods?: AgentVaultHttpMethod[] | null;
  allowedPathPrefixes?: string[] | null;
  allowedTools?: string[] | null;
};

// What the audit log and telemetry report of a service's own type. Another type's fields are absent.
export const serviceTypeReportFieldsOf = (service: TAgentVaultServiceTypeFields): TServiceTypeReportFields => {
  switch (service.type) {
    case AgentVaultServiceType.Http:
      return pick(service, ["hostPattern", "allowedMethods", "allowedPathPrefixes"]);
    case AgentVaultServiceType.Mcp:
      return pick(service, ["serverUrl", "transport", "hostPattern", "allowedTools"]);
    case AgentVaultServiceType.Ssh:
      return pick(service, ["host", "port"]);
    default:
      return {
        ...pick(service, ["host", "port", "database"]),
        tlsEnabled: service.tls.enabled,
        tlsVerify: service.tls.verify,
        hasTlsCa: Boolean(service.tls.ca)
      };
  }
};

// Only HTTP and MCP services have custom headers, and only HTTP services have substitutions.
export const serviceTransformationNamesOf = (service: {
  type: AgentVaultServiceType;
  customHeaders?: { name: string }[];
  substitutions?: { placeholder: string }[];
}) => ({
  customHeaderNames: service.customHeaders?.map((header) => header.name) ?? [],
  substitutionPlaceholders: service.substitutions?.map((substitution) => substitution.placeholder) ?? []
});

// The type of a variable an audit event names, and for an OAuth variable where its sign-in goes. Never a token.
export const variableAuditFieldsOf = (variable: {
  type: AgentVaultVariableType;
  oauth: {
    issuer: string | null;
    tokenEndpoint: string | null;
    scopes: string[];
    connection: { issuer: string } | null;
  } | null;
}) => ({
  type: variable.type,
  ...(variable.oauth
    ? {
        oauthIssuer: variable.oauth.connection?.issuer ?? variable.oauth.issuer ?? undefined,
        oauthTokenEndpoint: variable.oauth.tokenEndpoint ?? undefined,
        oauthScopes: variable.oauth.scopes
      }
    : {})
});

// Every route through which an OAuth variable gets tokens records it the same way: a sign-in completing (the variable
// routes or the dashboard's callback) and an import.
export const recordOauthVariableConnected = async (
  req: FastifyRequest,
  projectId: string,
  connected: TOauthVariableConnected
) => {
  await req.server.services.auditLog.createAuditLog({
    ...req.auditLogInfo,
    orgId: req.permission.orgId,
    projectId,
    event: {
      type: EventType.AGENT_VAULT_OAUTH_VARIABLE_CONNECT,
      metadata: {
        variableId: connected.variableId,
        key: connected.key,
        method: connected.method,
        oauthIssuer: connected.issuer,
        oauthScopes: connected.scopes
      }
    }
  });
  emitAgentVaultTelemetry(req.server.services.telemetry, req, {
    event: PostHogEventTypes.AgentVaultOauthVariableConnected,
    properties: { variableId: connected.variableId, method: connected.method }
  });
};
