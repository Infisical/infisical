import { TGenericPermission } from "@app/lib/types";

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
  // Accepted only to be refused by name: an inline MCP server can't be limited to some of its tools.
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
    | { type: AgentVaultCredentialType.OAuth; authorizationId?: string }
    | { type: AgentVaultCredentialType.SshKey; username: string; privateKey: string; certificate?: string };
  customHeaders?: { name: string; prefix?: string; value: string }[];
  substitutions?: { placeholder: string; surfaces: AgentVaultSubstitutionSurface[]; value: string }[];
};

export type TAgentVaultInlineBearerCredentialSummary = {
  type: AgentVaultCredentialType.Bearer;
  headerName: string;
  headerPrefix: string;
};

export type TAgentVaultInlineCredentialSummary =
  | TAgentVaultInlineBearerCredentialSummary
  | { type: AgentVaultCredentialType.Basic }
  | { type: AgentVaultCredentialType.Passthrough }
  | { type: AgentVaultCredentialType.SshKey; hasCertificate: boolean };

export type TAgentVaultInlineCustomHeaderSummary = { name: string; prefix: string };

export type TAgentVaultInlineSubstitutionSummary = { placeholder: string; surfaces: AgentVaultSubstitutionSurface[] };

/** An inline service as every read returns it: everything but its secrets. */
export type TAgentVaultInlineServiceSummary = {
  id: string;
  // The name it was sent with, or its first host when it was sent without one.
  name: string;
  description: string | null;
} & (
  | (Extract<TAgentVaultServiceTypeFields, { type: AgentVaultServiceType.Http }> & {
      credential: Exclude<TAgentVaultInlineCredentialSummary, { type: AgentVaultCredentialType.SshKey }>;
      customHeaders: TAgentVaultInlineCustomHeaderSummary[];
      substitutions: TAgentVaultInlineSubstitutionSummary[];
    })
  | (Extract<TAgentVaultServiceTypeFields, { type: AgentVaultServiceType.Mcp }> & {
      credential: TAgentVaultInlineBearerCredentialSummary;
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

export type TMintSessionDTO = {
  projectId: string;
  ctx: TGenericPermission;
  // Leave it out for a session with services of its own only.
  accessBundle?: string;
  // Inline services, which the API calls the session's services.
  services?: TAgentVaultInlineServiceInput[];
  /** The caller's name and email, snapshotted from the request. */
  actorName: string;
  actorEmail: string | null;
  ttl?: string;
  onBehalfOf?: TOnBehalfOfUser;
  label: string | null;
};

export type TListSessionsDTO = {
  projectId: string;
  ctx: TGenericPermission;
  scope: AgentVaultSessionScope;
  statuses?: AgentVaultSessionStatus[];
  limit: number;
  offset: number;
  search?: string;
};

export type TRevokeSessionDTO = {
  projectId: string;
  ctx: TGenericPermission;
  sessionId: string;
};

export type TGetSessionByIdDTO = TRevokeSessionDTO;

export type TUpdateSessionLabelDTO = TRevokeSessionDTO & {
  label: string | null;
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
