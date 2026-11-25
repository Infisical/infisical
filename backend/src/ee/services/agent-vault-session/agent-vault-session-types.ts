import { TGenericPermission } from "@app/lib/types";

import { TAgentVaultServiceHookInput, TAgentVaultServiceHookView } from "../agent-vault-hook/agent-vault-hook-fns";
import { AgentVaultOauthClientAuthMethod } from "../agent-vault-oauth/agent-vault-oauth-types";
import { TAgentVaultSkillFile } from "../agent-vault-skill/agent-vault-skill-types";
import {
  AgentVaultCredentialType,
  AgentVaultHttpMethod,
  AgentVaultMcpTransport,
  AgentVaultMemberType,
  AgentVaultServiceType,
  AgentVaultSessionScope,
  AgentVaultSessionStatus,
  AgentVaultSubstitutionSurface
} from "../agent-vault/agent-vault-enums";
import { TAgentVaultServiceTypeFields } from "../agent-vault/agent-vault-service-type-fns";

/** Exactly one of the two names the user. */
export type TOnBehalfOfUser = { userId?: string; userEmail?: string };

// Flat like a bundle service's create body, and like it, it also takes what inline services don't (another type's
// fields, member-provided fields, OAuth) so the session service can refuse each by name.
export type TAgentVaultInlineServiceInput = {
  type: AgentVaultServiceType;
  name?: string;
  description?: string | null;
  hostPattern?: string;
  serverUrl?: string;
  transport?: AgentVaultMcpTransport;
  host?: string;
  port?: number;
  database?: string;
  tls?: { enabled?: boolean; verify?: boolean; ca?: string | null };
  allowedMethods?: AgentVaultHttpMethod[] | null;
  allowedPathPrefixes?: string[] | null;
  allowedTools?: string[] | null;
  credential:
    | {
        type: AgentVaultCredentialType.Bearer;
        headerName?: string;
        headerPrefix?: string;
        value: string;
        memberProvidedFields?: string[];
      }
    | {
        type: AgentVaultCredentialType.Basic;
        username?: string;
        password?: string;
        memberProvidedFields?: string[];
      }
    | { type: AgentVaultCredentialType.Passthrough }
    | {
        type: AgentVaultCredentialType.OAuth;
        // Accepted only so a sign-in is refused by name.
        authorizationId?: string;
        // A global OAuth variable's key, or the tokens and the provider's details below, never both.
        variable?: string;
        accessToken?: string;
        refreshToken?: string;
        expiresAt?: string;
        authorizationEndpoint?: string;
        tokenEndpoint?: string;
        issuer?: string;
        clientId?: string;
        clientSecret?: string;
        tokenEndpointAuthMethod?: AgentVaultOauthClientAuthMethod;
        scopes?: string[];
        resource?: string;
      }
    | { type: AgentVaultCredentialType.SshKey; username: string; privateKey: string; certificate?: string };
  customHeaders?: { name: string; prefix?: string; value: string }[];
  substitutions?: { placeholder: string; surfaces: AgentVaultSubstitutionSurface[]; value: string }[];
  // A saved hook of the project, by name.
  hook?: TAgentVaultServiceHookInput;
};

export type TAgentVaultInlineBearerCredentialSummary = {
  type: AgentVaultCredentialType.Bearer;
  headerName: string;
  headerPrefix: string;
};

export type TAgentVaultInlineOauthCredentialSummary = {
  type: AgentVaultCredentialType.OAuth;
  source: "variable" | "inline";
  // Absent once the variable is deleted, and for a caller who can't read variables.
  variable?: { id: string; key: string };
  // Tokens sent with the session only.
  issuer?: string;
  grantedScopes?: string[];
};

export type TAgentVaultInlineCredentialSummary =
  | TAgentVaultInlineBearerCredentialSummary
  | { type: AgentVaultCredentialType.Basic }
  | { type: AgentVaultCredentialType.Passthrough }
  | { type: AgentVaultCredentialType.SshKey; hasCertificate: boolean }
  | TAgentVaultInlineOauthCredentialSummary;

export type TAgentVaultInlineCustomHeaderSummary = { name: string; prefix: string };

export type TAgentVaultInlineSubstitutionSummary = { placeholder: string; surfaces: AgentVaultSubstitutionSurface[] };

/** An inline service as every read returns it: everything but its secrets. */
export type TAgentVaultInlineServiceSummary = {
  id: string;
  // The name it was sent with, or its first host when it was sent without one.
  name: string;
  description: string | null;
  // Left out for a caller who can't read hooks, since null would claim there is none.
  hook?: TAgentVaultServiceHookView | null;
} & (
  | (Extract<TAgentVaultServiceTypeFields, { type: AgentVaultServiceType.Http }> & {
      credential: Exclude<TAgentVaultInlineCredentialSummary, { type: AgentVaultCredentialType.SshKey }>;
      customHeaders: TAgentVaultInlineCustomHeaderSummary[];
      substitutions: TAgentVaultInlineSubstitutionSummary[];
    })
  | (Extract<TAgentVaultServiceTypeFields, { type: AgentVaultServiceType.Mcp }> & {
      credential: TAgentVaultInlineBearerCredentialSummary | TAgentVaultInlineOauthCredentialSummary;
      customHeaders: TAgentVaultInlineCustomHeaderSummary[];
    })
  | (Extract<TAgentVaultServiceTypeFields, { type: AgentVaultServiceType.Postgres | AgentVaultServiceType.Mysql }> & {
      credential: { type: AgentVaultCredentialType.Basic };
    })
  | (Extract<TAgentVaultServiceTypeFields, { type: AgentVaultServiceType.Ssh }> & {
      credential: Extract<
        TAgentVaultInlineCredentialSummary,
        { type: AgentVaultCredentialType.Basic | AgentVaultCredentialType.SshKey }
      >;
    })
);

/**
 * A session's services as every read returns them, in the order sent: one it lists by name with only what identifies
 * it, and one sent inline with its settings but never its secrets.
 */
export type TAgentVaultSessionServiceSummary =
  | {
      id: string;
      name: string;
      type: AgentVaultServiceType;
      description: string | null;
      // The host an HTTP or MCP service matches. Null for database and SSH services, which have none.
      hostPattern: string | null;
      isInline: false;
    }
  | (TAgentVaultInlineServiceSummary & { isInline: true });

// A skill sent with a session: the files of a skill uploaded to the project, its name and description in SKILL.md.
export type TAgentVaultInlineSkillInput = { files: TAgentVaultSkillFile[] };

/** A skill sent with a session, as every read returns it: never with its files. */
export type TAgentVaultSessionInlineSkillSummary = {
  id: string;
  name: string;
  description: string;
  sha256: string;
  sizeBytes: number;
  fileCount: number;
  isInline: true;
};

/**
 * A session's skills as every read returns them, in the order sent: one it lists by name with only what identifies it,
 * and one sent inline, never with its files.
 */
export type TAgentVaultSessionSkillSummary =
  | { id: string; name: string; description: string; isInline: false }
  | TAgentVaultSessionInlineSkillSummary;

export type TMintSessionDTO = {
  projectId: string;
  ctx: TGenericPermission;
  // Leave it out for a session with only services or skills, listed by name or sent inline.
  accessBundle?: string;
  // Each one the name of a project service, or a service sent inline.
  services?: (string | TAgentVaultInlineServiceInput)[];
  // Each one the name of a project skill, or a skill sent inline.
  skills?: (string | TAgentVaultInlineSkillInput)[];
  /** The caller's name and email, snapshotted from the request. */
  actorName: string;
  actorEmail: string | null;
  ttl?: string;
  onBehalfOf?: TOnBehalfOfUser;
  label: string | null;
  metadata?: Record<string, string>;
};

export type TAgentVaultSessionMetadataFilter = Array<{ key: string; value: string }>;

export type TListSessionsDTO = {
  projectId: string;
  ctx: TGenericPermission;
  scope: AgentVaultSessionScope;
  statuses?: AgentVaultSessionStatus[];
  limit: number;
  offset: number;
  search?: string;
  metadataFilter?: TAgentVaultSessionMetadataFilter;
};

export type TRevokeSessionDTO = {
  projectId: string;
  ctx: TGenericPermission;
  sessionId: string;
};

export type TGetSessionByIdDTO = TRevokeSessionDTO;

// A field left out keeps its value. Metadata replaces the whole set.
export type TUpdateSessionDTO = TRevokeSessionDTO & {
  label?: string | null;
  metadata?: Record<string, string>;
};

export type TAgentVaultSessionActor =
  | {
      type: AgentVaultMemberType.User;
      id: string | null;
      username: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
    }
  | { type: AgentVaultMemberType.MachineIdentity; id: string | null; name: string };

/** The user a machine identity started a session on behalf of. `id` is null once the user is deleted. */
export type TAgentVaultSessionOnBehalfOf = Extract<TAgentVaultSessionActor, { type: AgentVaultMemberType.User }>;
