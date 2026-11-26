import { ActorType, AuthMethod } from "./actor-types";

// A user or identity whose project privileges the principal assumed, for that project only.
export type TAssumedPrincipal = {
  projectId: string;
  actorType: ActorType.USER | ActorType.IDENTITY;
  actorId: string;
  // For `{{identity.username}}` conditions.
  actorName?: string;
};

export type TUserPrincipal = {
  type: ActorType.USER;
  id: string;
  username: string;
  email: string | null;
  // Null for the deprecated API key mode, which has no sign-in method.
  authMethod: AuthMethod | null;
  isSuperAdmin: boolean;
  isMfaVerified?: boolean;
  // Root org whose IdP issued the session (SAML, OIDC, LDAP). Unset for own-credential sessions.
  sessionRootOrgId?: string;
  // Set on delegated OAuth tokens. `scopes` undefined means fully delegated; a list, even empty, narrows.
  oauth?: { clientId: string; scopes?: string[] };
  assumed?: TAssumedPrincipal;
};

export type TIdentityPrincipal = {
  type: ActorType.IDENTITY;
  id: string;
  name: string;
  isInstanceAdmin: boolean;
  // What the identity authed with (OIDC claims, k8s namespace, etc.), for `{{identity.auth.*}}` conditions. Only set
  // for the identity making the request.
  authInfo?: Record<string, unknown>;
  // A delegated OAuth requester's scopes, when this identity's permission is built during that request.
  oauth?: { clientId: string; scopes?: string[] };
  assumed?: TAssumedPrincipal;
};

export type TServiceTokenPrincipal = {
  type: ActorType.SERVICE;
  id: string;
  projectId: string;
};

type TDeployedComponentPrincipal<T extends ActorType> = { type: T; id: string };

export type TPlatformPrincipal = { type: ActorType.PLATFORM; id: "platform" };

export type TPrincipal =
  | TUserPrincipal
  | TIdentityPrincipal
  | TServiceTokenPrincipal
  | TDeployedComponentPrincipal<ActorType.SCIM_CLIENT>
  | TDeployedComponentPrincipal<ActorType.GATEWAY>
  | TDeployedComponentPrincipal<ActorType.RELAY>
  | TDeployedComponentPrincipal<ActorType.KMIP_SERVER>
  | TDeployedComponentPrincipal<ActorType.AGENT_VAULT_PROXY>
  | TPlatformPrincipal;

// Narrows every permission built during the request: the requester's own and any built for another actor.
export const delegatedOauthOf = (principal: TPrincipal | undefined): TUserPrincipal["oauth"] =>
  principal?.type === ActorType.USER || principal?.type === ActorType.IDENTITY ? principal.oauth : undefined;

// undefined means not narrowed.
export const delegatedOauthScopesOf = (principal: TPrincipal | undefined): string[] | undefined =>
  delegatedOauthOf(principal)?.scopes;

export const platformPrincipal = (): TPlatformPrincipal => ({ type: ActorType.PLATFORM, id: "platform" });

export const isUserPrincipal = (principal: TPrincipal): principal is TUserPrincipal =>
  principal.type === ActorType.USER;

export const isIdentityPrincipal = (principal: TPrincipal): principal is TIdentityPrincipal =>
  principal.type === ActorType.IDENTITY;

// The assumed actor inside its project, otherwise the principal itself.
export const effectiveActorForProject = (
  principal: TUserPrincipal | TIdentityPrincipal,
  projectId: string
): { actorType: ActorType.USER | ActorType.IDENTITY; actorId: string } => {
  if (principal.assumed && principal.assumed.projectId === projectId) {
    return { actorType: principal.assumed.actorType, actorId: principal.assumed.actorId };
  }
  return { actorType: principal.type, actorId: principal.id };
};
