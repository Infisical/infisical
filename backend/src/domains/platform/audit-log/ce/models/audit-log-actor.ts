import { ActorType } from "@app/lib/auth/actor-types";
import type { TPrincipal } from "@app/lib/auth/principal";

// What an identity proved at sign-in, as the audit log records it. Snapshots, not the auth services' own types, so a
// change there can't silently change what audit logs and log streams carry.
type TAuditLogAwsAuthDetails = {
  accountId: string;
  arn: string;
  userId: string;
  partition: string;
  service: string;
  resourceType: string;
  resourceName: string;
};

type TAuditLogKubernetesAuthDetails = {
  namespace: string;
  name: string;
};

type TAuditLogOidcAuthDetails = {
  claims: Record<string, string>;
};

interface UserActorMetadata {
  userId: string;
  email?: string | null;
  username: string;
  permission?: Record<string, unknown>;
  authMethod?: string;
  oauthClientId?: string;
}

interface ServiceActorMetadata {
  serviceId: string;
  name: string;
}

interface IdentityActorMetadata {
  identityId: string;
  name: string;
  permission?: Record<string, unknown>;
  authMethod?: string;
  aws?: TAuditLogAwsAuthDetails;
  kubernetes?: TAuditLogKubernetesAuthDetails;
  oidc?: TAuditLogOidcAuthDetails;
}

interface ScimClientActorMetadata {}

interface PlatformActorMetadata {}

interface KmipClientActorMetadata {
  clientId: string;
  name: string;
}

interface AcmeProfileActorMetadata {
  profileId: string;
}

interface AcmeAccountActorMetadata {
  profileId: string;
  accountId: string;
}

interface EstAccountActorMetadata {
  profileId: string;
}

interface ScepAccountActorMetadata {
  profileId: string;
}

interface MicrosoftAutoenrollmentAccountActorMetadata {
  profileId: string;
}

interface UnknownUserActorMetadata {}

interface GatewayActorMetadata {
  gatewayId: string;
}

interface RelayActorMetadata {
  relayId: string;
}

interface KmipServerActorMetadata {
  kmipServerId: string;
}

interface AgentVaultProxyActorMetadata {
  agentVaultProxyId: string;
}

export interface UserActor {
  type: ActorType.USER;
  metadata: UserActorMetadata;
}

export interface ServiceActor {
  type: ActorType.SERVICE;
  metadata: ServiceActorMetadata;
}

export interface PlatformActor {
  type: ActorType.PLATFORM;
  metadata: PlatformActorMetadata;
}

export interface KmipClientActor {
  type: ActorType.KMIP_CLIENT;
  metadata: KmipClientActorMetadata;
}

export interface UnknownUserActor {
  type: ActorType.UNKNOWN_USER;
  metadata: UnknownUserActorMetadata;
}

export interface IdentityActor {
  type: ActorType.IDENTITY;
  metadata: IdentityActorMetadata;
}

export interface ScimClientActor {
  type: ActorType.SCIM_CLIENT;
  metadata: ScimClientActorMetadata;
}

export interface AcmeProfileActor {
  type: ActorType.ACME_PROFILE;
  metadata: AcmeProfileActorMetadata;
}

export interface AcmeAccountActor {
  type: ActorType.ACME_ACCOUNT;
  metadata: AcmeAccountActorMetadata;
}

export interface EstAccountActor {
  type: ActorType.EST_ACCOUNT;
  metadata: EstAccountActorMetadata;
}
export interface ScepAccountActor {
  type: ActorType.SCEP_ACCOUNT;
  metadata: ScepAccountActorMetadata;
}

export interface MicrosoftAutoenrollmentAccountActor {
  type: ActorType.MICROSOFT_AUTOENROLLMENT_ACCOUNT;
  metadata: MicrosoftAutoenrollmentAccountActorMetadata;
}

export interface GatewayActor {
  type: ActorType.GATEWAY;
  metadata: GatewayActorMetadata;
}

export interface RelayActor {
  type: ActorType.RELAY;
  metadata: RelayActorMetadata;
}

export interface KmipServerActor {
  type: ActorType.KMIP_SERVER;
  metadata: KmipServerActorMetadata;
}

export interface AgentVaultProxyActor {
  type: ActorType.AGENT_VAULT_PROXY;
  metadata: AgentVaultProxyActorMetadata;
}

export type TAuditLogActorRecord =
  | UserActor
  | ServiceActor
  | IdentityActor
  | ScimClientActor
  | PlatformActor
  | KmipClientActor
  | AcmeProfileActor
  | AcmeAccountActor
  | EstAccountActor
  | ScepAccountActor
  | MicrosoftAutoenrollmentAccountActor
  | GatewayActor
  | RelayActor
  | KmipServerActor
  | AgentVaultProxyActor;

export type TAuditLogRequestActorRecord =
  | UserActor
  | ServiceActor
  | IdentityActor
  | ScimClientActor
  | UnknownUserActor
  | GatewayActor
  | RelayActor
  | KmipServerActor
  | AgentVaultProxyActor;

// Maps each actor type to the key in actorMetadata that holds the actor's id. ACME_PROFILE, EST_ACCOUNT,
// SCEP_ACCOUNT and MICROSOFT_AUTOENROLLMENT_ACCOUNT all use "profileId", matching their metadata.
const METADATA_ID_KEYS: Partial<Record<ActorType, string>> = {
  [ActorType.USER]: "userId",
  [ActorType.IDENTITY]: "identityId",
  [ActorType.KMIP_CLIENT]: "clientId",
  [ActorType.SERVICE]: "serviceId",
  [ActorType.ACME_PROFILE]: "profileId",
  [ActorType.ACME_ACCOUNT]: "accountId",
  [ActorType.EST_ACCOUNT]: "profileId",
  [ActorType.SCEP_ACCOUNT]: "profileId",
  [ActorType.MICROSOFT_AUTOENROLLMENT_ACCOUNT]: "profileId",
  [ActorType.GATEWAY]: "gatewayId",
  [ActorType.RELAY]: "relayId",
  [ActorType.KMIP_SERVER]: "kmipServerId",
  [ActorType.AGENT_VAULT_PROXY]: "agentVaultProxyId"
};

// Who did it, as the audit log records it.
export class AuditLogActor {
  static readonly METADATA_ID_KEYS = METADATA_ID_KEYS;

  private constructor(private readonly record: TAuditLogActorRecord) {}

  static restore(record: TAuditLogActorRecord): AuditLogActor {
    return new AuditLogActor(record);
  }

  // The same metadata the audit log plugin builds from a request. `permission` is the actor's attributes in the
  // project the request acted in, when there is one.
  static fromPrincipal(principal: TPrincipal, permission?: Record<string, unknown>): AuditLogActor {
    switch (principal.type) {
      case ActorType.USER:
        return new AuditLogActor({
          type: ActorType.USER,
          metadata: {
            ...(principal.authMethod ? { authMethod: principal.authMethod } : {}),
            ...(principal.oauth ? { oauthClientId: principal.oauth.clientId } : {}),
            email: principal.email,
            username: principal.username,
            userId: principal.id,
            ...(permission ? { permission } : {})
          }
        });
      case ActorType.IDENTITY: {
        const authInfo = principal.authInfo as Partial<IdentityActorMetadata> | undefined;
        return new AuditLogActor({
          type: ActorType.IDENTITY,
          metadata: {
            name: principal.name,
            identityId: principal.id,
            ...(authInfo?.authMethod ? { authMethod: authInfo.authMethod } : {}),
            ...(authInfo?.aws ? { aws: authInfo.aws } : {}),
            ...(authInfo?.kubernetes ? { kubernetes: authInfo.kubernetes } : {}),
            ...(authInfo?.oidc ? { oidc: authInfo.oidc } : {}),
            ...(permission ? { permission } : {})
          }
        });
      }
      case ActorType.SERVICE:
        return new AuditLogActor({
          type: ActorType.SERVICE,
          metadata: { name: principal.name, serviceId: principal.id }
        });
      case ActorType.SCIM_CLIENT:
        return new AuditLogActor({ type: ActorType.SCIM_CLIENT, metadata: {} });
      case ActorType.GATEWAY:
        return new AuditLogActor({ type: ActorType.GATEWAY, metadata: { gatewayId: principal.id } });
      case ActorType.RELAY:
        return new AuditLogActor({ type: ActorType.RELAY, metadata: { relayId: principal.id } });
      case ActorType.KMIP_SERVER:
        return new AuditLogActor({ type: ActorType.KMIP_SERVER, metadata: { kmipServerId: principal.id } });
      case ActorType.AGENT_VAULT_PROXY:
        return new AuditLogActor({ type: ActorType.AGENT_VAULT_PROXY, metadata: { agentVaultProxyId: principal.id } });
      case ActorType.PLATFORM:
        return new AuditLogActor({ type: ActorType.PLATFORM, metadata: {} });
      default:
        throw new Error(`audit-log: no actor for principal type [type=${(principal as { type: string }).type}]`);
    }
  }

  get type(): ActorType {
    return this.record.type;
  }

  // The actor's id, read from the key its type keeps it under; undefined for actors without one.
  get id(): string | undefined {
    const key = METADATA_ID_KEYS[this.record.type];
    const value = key ? (this.record.metadata as Record<string, unknown>)[key] : undefined;
    return typeof value === "string" ? value : undefined;
  }

  toJSON(): TAuditLogActorRecord {
    return this.record;
  }
}
