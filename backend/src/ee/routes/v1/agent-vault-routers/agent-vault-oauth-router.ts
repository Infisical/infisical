import { z } from "zod";

import { AgentVaultOauthAuthorizationStatus } from "@app/ee/services/agent-vault/agent-vault-enums";
import {
  MAX_CLIENT_ID_LENGTH,
  MAX_CLIENT_SECRET_LENGTH
} from "@app/ee/services/agent-vault-oauth/agent-vault-oauth-client-fns";
import { OAUTH_VSCHAR_PATTERN } from "@app/ee/services/agent-vault-oauth/agent-vault-oauth-token-fns";
import { AgentVaultOauthRegistration } from "@app/ee/services/agent-vault-oauth/agent-vault-oauth-types";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { actorContext } from "./agent-vault-router-fns";
import { AgentVaultServerUrlSchema } from "./agent-vault-schemas";

const AuthorizationViewSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.OAUTH.authorizationId),
  status: z.nativeEnum(AgentVaultOauthAuthorizationStatus).describe(AGENT_VAULT.OAUTH.status),
  error: z.string().nullable().describe(AGENT_VAULT.OAUTH.error),
  scopes: z.string().array().describe(AGENT_VAULT.OAUTH.scopes)
});

const printable = (max: number) =>
  z.string().max(max).regex(OAUTH_VSCHAR_PATTERN, "Use printable ASCII characters without line breaks or accents");

// Sent to the provider as typed, unlike the credential fields that take `{{KEY}}`, so a reference would only come
// back as an invalid_client nobody can explain.
const noVariableReference = (value: string) => !value.includes("{{");
const VARIABLES_NOT_SUPPORTED_MESSAGE = "Variables aren't supported here. Paste the value.";

// JWT only: an authorization ends in a browser redirect, so only a signed-in user can start or finish one.
export const registerAgentVaultOauthRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/authorizations",
    config: { rateLimit: writeLimit },
    schema: {
      hide: true,
      operationId: "createAgentVaultOauthAuthorization",
      description:
        "Start an OAuth authorization for an MCP service: discovers the server's authorization server, registers a client, and returns the URL to sign in at.",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      body: z.object({
        accessBundleId: z.string().uuid().describe(AGENT_VAULT.OAUTH.accessBundleId),
        serverUrl: AgentVaultServerUrlSchema.describe(AGENT_VAULT.OAUTH.serverUrl),
        serviceId: z.string().uuid().optional().describe(AGENT_VAULT.OAUTH.serviceId),
        clientId: z
          .string()
          .trim()
          .min(1)
          .pipe(printable(MAX_CLIENT_ID_LENGTH))
          .refine(noVariableReference, VARIABLES_NOT_SUPPORTED_MESSAGE)
          .optional()
          .describe(AGENT_VAULT.OAUTH.clientId),
        clientSecret: z
          .string()
          .min(1)
          .pipe(printable(MAX_CLIENT_SECRET_LENGTH))
          .refine(noVariableReference, VARIABLES_NOT_SUPPORTED_MESSAGE)
          .optional()
          .describe(AGENT_VAULT.OAUTH.clientSecret),
        registration: z.literal(AgentVaultOauthRegistration.Dynamic).optional().describe(AGENT_VAULT.OAUTH.registration)
      }),
      response: {
        200: z.object({
          registrationRequired: z.boolean().describe(AGENT_VAULT.OAUTH.registrationRequired),
          oauthAdvertised: z.boolean().describe(AGENT_VAULT.OAUTH.oauthAdvertised),
          redirectUri: z.string().describe(AGENT_VAULT.OAUTH.redirectUri),
          authorization: z
            .object({
              id: z.string().uuid().describe(AGENT_VAULT.OAUTH.authorizationId),
              authorizeUrl: z.string().describe(AGENT_VAULT.OAUTH.authorizeUrl)
            })
            .nullable()
            .describe(AGENT_VAULT.OAUTH.authorization)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) =>
      server.services.agentVaultOauth.createAuthorization({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        ...req.body
      })
  });

  // An action sub-resource rather than a PATCH of the status: completing exchanges a one-time code with a third
  // party, and the callback page only knows what the redirect carried.
  server.route({
    method: "POST",
    url: "/authorizations/:authorizationId/complete",
    config: { rateLimit: writeLimit },
    schema: {
      hide: true,
      operationId: "completeAgentVaultOauthAuthorization",
      description:
        "Finish an OAuth authorization with what the authorization server's redirect carried. An exchange failure returns 200 with status `failed`, so the callback page can show why.",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({ authorizationId: z.string().uuid().describe(AGENT_VAULT.OAUTH.authorizationId) }),
      body: z.object({
        state: z.string().min(1).max(256).describe(AGENT_VAULT.OAUTH.state),
        code: z.string().min(1).max(4096).optional().describe(AGENT_VAULT.OAUTH.code),
        iss: z.string().max(2048).optional().describe(AGENT_VAULT.OAUTH.iss),
        // Provider text, accepted as sent so a long or multi-line reason still fails the authorization; the
        // service normalizes it before storing it.
        error: z.string().max(1024).optional().describe(AGENT_VAULT.OAUTH.callbackError),
        errorDescription: z.string().max(4096).optional().describe(AGENT_VAULT.OAUTH.callbackErrorDescription)
      }),
      response: { 200: z.object({ authorization: AuthorizationViewSchema.describe(AGENT_VAULT.OAUTH.authorization) }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) =>
      server.services.agentVaultOauth.completeAuthorization({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        authorizationId: req.params.authorizationId,
        ...req.body
      })
  });

  server.route({
    method: "GET",
    url: "/authorizations/:authorizationId",
    config: { rateLimit: readLimit },
    schema: {
      hide: true,
      operationId: "getAgentVaultOauthAuthorization",
      description: "Get an OAuth authorization's status. Tokens are never returned.",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      params: z.object({ authorizationId: z.string().uuid().describe(AGENT_VAULT.OAUTH.authorizationId) }),
      response: { 200: z.object({ authorization: AuthorizationViewSchema.describe(AGENT_VAULT.OAUTH.authorization) }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) =>
      server.services.agentVaultOauth.getAuthorization({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        authorizationId: req.params.authorizationId
      })
  });
};
