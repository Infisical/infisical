import { ActorType, AuthMethod } from "./actor-types";

// A user or identity whose project privileges the principal has assumed, for that project only.
export type TAssumedPrincipal = {
  projectId: string;
  actorType: ActorType.USER | ActorType.IDENTITY;
  actorId: string;
};

export type TUserPrincipal = {
  type: ActorType.USER;
  id: string;
  username: string;
  email: string | null;
  // Null for the deprecated API key mode, which carries no sign-in method.
  authMethod: AuthMethod | null;
  isSuperAdmin: boolean;
  isMfaVerified?: boolean;
  // The root org whose IdP issued the session (SAML, OIDC, LDAP). Absent on own-credential sessions.
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
  // What the identity authenticated with (OIDC claims, Kubernetes namespace, and so on), read by
  // `{{identity.auth.*}}` conditions. Present only for the identity making the request.
  authInfo?: Record<string, unknown>;
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

export const platformPrincipal = (): TPlatformPrincipal => ({ type: ActorType.PLATFORM, id: "platform" });

export const isUserPrincipal = (principal: TPrincipal): principal is TUserPrincipal =>
  principal.type === ActorType.USER;

export const isIdentityPrincipal = (principal: TPrincipal): principal is TIdentityPrincipal =>
  principal.type === ActorType.IDENTITY;

// The user or identity whose grants decide access in a project: the assumed one inside its project,
// otherwise the principal itself.
export const effectiveActorForProject = (
  principal: TUserPrincipal | TIdentityPrincipal,
  projectId: string
): { actorType: ActorType.USER | ActorType.IDENTITY; actorId: string } => {
  if (principal.assumed && principal.assumed.projectId === projectId) {
    return { actorType: principal.assumed.actorType, actorId: principal.assumed.actorId };
  }
  return { actorType: principal.type, actorId: principal.id };
};
