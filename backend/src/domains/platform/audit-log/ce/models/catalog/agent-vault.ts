import { EventType } from "../event-type";
import type { TAuditLogObjectStorageType } from "./shared";

export interface AgentVaultProxyRegisterEvent {
  type: EventType.AGENT_VAULT_PROXY_REGISTER;
  metadata: {
    proxyId: string;
    name: string;
    description: string | null;
  };
}

export interface AgentVaultProxyTokenReissueEvent {
  type: EventType.AGENT_VAULT_PROXY_TOKEN_REISSUE;
  metadata: {
    proxyId: string;
    name: string;
  };
}

export interface AgentVaultProxyTokenRotateEvent {
  type: EventType.AGENT_VAULT_PROXY_TOKEN_ROTATE;
  metadata: {
    proxyId: string;
    name: string;
  };
}

export interface AgentVaultProxyEnrollEvent {
  type: EventType.AGENT_VAULT_PROXY_ENROLL;
  metadata: {
    proxyId: string;
    name: string;
    rootCaFingerprint: string;
    replacedExistingCa: boolean;
  };
}

export interface AgentVaultProxyUpdateEvent {
  type: EventType.AGENT_VAULT_PROXY_UPDATE;
  metadata: {
    proxyId: string;
    name: string;
    description?: string | null;
    trafficPolicy?: string;
    allowedHosts?: string | null;
    pollInterval?: number;
  };
}

export interface AgentVaultProxyRevokeEvent {
  type: EventType.AGENT_VAULT_PROXY_REVOKE;
  metadata: {
    proxyId: string;
    name: string;
  };
}

export interface AgentVaultProxyDeleteEvent {
  type: EventType.AGENT_VAULT_PROXY_DELETE;
  metadata: {
    proxyId: string;
    name: string;
  };
}

export interface AgentVaultSessionLogSettingsUpdateEvent {
  type: EventType.AGENT_VAULT_SESSION_LOG_SETTINGS_UPDATE;
  metadata: {
    enabled: boolean;
    // Null when session logs are off.
    storageType: TAuditLogObjectStorageType | null;
    appConnectionId: string | null;
    appConnectionName: string | null;
    bucket: string | null;
    region: string | null;
    keyPrefix: string | null;
    // The storage that was recording before this change, when it changed the storage or turned session logs off.
    previousStorageType?: TAuditLogObjectStorageType | null;
    previousAppConnectionId?: string | null;
    previousAppConnectionName?: string | null;
    previousBucket?: string | null;
    previousRegion?: string | null;
    previousKeyPrefix?: string | null;
  };
}

export interface AgentVaultAccessBundleCreateEvent {
  type: EventType.AGENT_VAULT_ACCESS_BUNDLE_CREATE;
  metadata: {
    accessBundleId: string;
    name: string;
    description?: string | null;
  };
}

export interface AgentVaultAccessBundleUpdateEvent {
  type: EventType.AGENT_VAULT_ACCESS_BUNDLE_UPDATE;
  metadata: {
    accessBundleId: string;
    name: string;
    description?: string | null;
  };
}

export interface AgentVaultAccessBundleDeleteEvent {
  type: EventType.AGENT_VAULT_ACCESS_BUNDLE_DELETE;
  metadata: {
    accessBundleId: string;
    name: string;
  };
}

// A service's hook: the saved hook by ID and name, and what it checks of the service. No narrowing means every request,
// or every connection for a database or SSH service.
export type TAgentVaultServiceHookAudit = {
  id: string;
  name: string;
  methods?: string[];
  paths?: string[];
  tools?: string[];
};

export interface AgentVaultServiceCreateEvent {
  type: EventType.AGENT_VAULT_SERVICE_CREATE;
  metadata: {
    // Services belonged to one access bundle until they moved to the project, so these are present only on events
    // recorded before that.
    accessBundleId?: string;
    accessBundleName?: string;
    // The access bundles the service was in. Absent on events recorded before services moved to the project.
    accessBundles?: { id: string; name: string }[];
    serviceId: string;
    name: string;
    description?: string | null;
    serviceType: string;
    // MCP services only.
    serverUrl?: string;
    transport?: string;
    // Database and SSH services only. A host pattern is never set on those, so they report these instead.
    host?: string;
    port?: number;
    database?: string;
    tlsEnabled?: boolean;
    tlsVerify?: boolean;
    // Whether the proxy checks the server's certificate against a CA stored on the service rather than the system's.
    hasTlsCa?: boolean;
    // Absent for a database or SSH service.
    hostPattern?: string;
    credentialType: string;
    // OAuth credentials only. A service that sends an OAuth variable's sign-in names the variable instead.
    oauthIssuer?: string;
    oauthScopes?: string[];
    oauthVariable?: { id: string; key: string };
    headerName?: string;
    headerPrefix?: string;
    allowedMethods?: string[] | null;
    allowedPathPrefixes?: string[] | null;
    allowedTools?: string[] | null;
    // The fields each member sets for themselves, such as credential-value or credential-username.
    memberProvidedFields?: string[];
    // Names and placeholders only. A sealed value must never reach an audit row.
    customHeaderNames?: string[];
    substitutionPlaceholders?: string[];
    variableKeys?: string[];
    // The saved hook the service was created with and what it checks of the service; no narrowing means every request.
    hook?: TAgentVaultServiceHookAudit;
    // Present only on events recorded before hooks became their own resource.
    hookUrl?: string;
  };
}

export interface AgentVaultServiceUpdateEvent {
  type: EventType.AGENT_VAULT_SERVICE_UPDATE;
  metadata: {
    // Services belonged to one access bundle until they moved to the project, so these are present only on events
    // recorded before that.
    accessBundleId?: string;
    accessBundleName?: string;
    serviceId: string;
    // The service's name after the update. Absent on events recorded before it was added; `name` is set only by a rename.
    serviceName?: string;
    name?: string;
    // Null when the update removed it.
    description?: string | null;
    // The service's type, which never changes, so present on every update.
    serviceType: string;
    serverUrl?: string;
    transport?: string;
    // Database and SSH services only. A host pattern is never set on those, so they report these instead.
    host?: string;
    port?: number;
    database?: string;
    tlsEnabled?: boolean;
    tlsVerify?: boolean;
    // Present only when the update changed the stored CA the proxy checks the server's certificate against.
    tlsCaChanged?: "set" | "removed" | "replaced";
    // Present only when the update set, changed or removed the service's hook. `hook` is the hook afterwards, null when
    // removed, and `previousHook` the one before, null when there was none.
    hookChanged?: "set" | "removed" | "updated";
    hook?: TAgentVaultServiceHookAudit | null;
    previousHook?: TAgentVaultServiceHookAudit | null;
    // Present only on events recorded before hooks became their own resource.
    hookUrl?: string;
    hookSecretReplaced?: boolean;
    hostPattern?: string;
    credentialType?: string;
    // Present when the update connected or reauthorized an OAuth credential, or the variable when it chose an OAuth
    // variable.
    oauthIssuer?: string;
    oauthScopes?: string[];
    oauthVariable?: { id: string; key: string };
    headerName?: string;
    headerPrefix?: string;
    allowedMethods?: string[] | null;
    allowedPathPrefixes?: string[] | null;
    allowedTools?: string[] | null;
    // The fields each member sets for themselves after the update, present when it touched the credential.
    memberProvidedFields?: string[];
    customHeaderNames?: string[];
    customHeadersReplaced?: string[];
    substitutionPlaceholders?: string[];
    substitutionsReplaced?: string[];
    credentialReplaced: boolean;
    // Whether the update deleted what members saved for the service: their typed values or their OAuth connections.
    personalValuesCleared?: boolean;
    // Every key the service uses after the update, present when the update wrote a value that can hold one.
    variableKeys?: string[];
  };
}

export interface AgentVaultServiceDeleteEvent {
  type: EventType.AGENT_VAULT_SERVICE_DELETE;
  metadata: {
    // Services belonged to one access bundle until they moved to the project, so these are present only on events
    // recorded before that.
    accessBundleId?: string;
    accessBundleName?: string;
    // The access bundles the service was in. Absent on events recorded before services moved to the project.
    accessBundles?: { id: string; name: string }[];
    serviceId: string;
    name: string;
  };
}

// Keys only. A variable's value never reaches an audit row. Variables belonged to an access bundle until they moved to
// Agent Vault as a whole, so accessBundleId and accessBundleName are present only on events recorded before that.
export interface AgentVaultVariableCreateEvent {
  type: EventType.AGENT_VAULT_VARIABLE_CREATE;
  metadata: {
    accessBundleId?: string;
    accessBundleName?: string;
    variableId: string;
    key: string;
    // global, or personal for a variable only its owner sees and uses. Absent on events from before personal ones.
    scope?: string;
    // text or oauth. Absent on events from before OAuth variables.
    type?: string;
    // OAuth variables only: where its sign-in goes. Never a token.
    oauthIssuer?: string;
    oauthTokenEndpoint?: string;
    oauthScopes?: string[];
  };
}

export interface AgentVaultVariableUpdateEvent {
  type: EventType.AGENT_VAULT_VARIABLE_UPDATE;
  metadata: {
    accessBundleId?: string;
    accessBundleName?: string;
    variableId: string;
    key: string;
    // global, or personal for a variable only its owner sees and uses. Absent on events from before personal ones.
    scope?: string;
    // text or oauth. Absent on events from before OAuth variables.
    type?: string;
    // OAuth variables only: where its sign-in goes. Never a token.
    oauthIssuer?: string;
    oauthTokenEndpoint?: string;
    oauthScopes?: string[];
    // Present only when the update changed the key.
    previousKey?: string;
    // For an OAuth variable: whether its tokens were replaced by an import or removed by a disconnect.
    valueReplaced: boolean;
  };
}

export interface AgentVaultVariableDeleteEvent {
  type: EventType.AGENT_VAULT_VARIABLE_DELETE;
  metadata: {
    accessBundleId?: string;
    accessBundleName?: string;
    variableId: string;
    key: string;
    // global, or personal for a variable only its owner sees and uses. Absent on events from before personal ones.
    scope?: string;
    // text or oauth. Absent on events from before OAuth variables.
    type?: string;
    // OAuth variables only: where its sign-in goes. Never a token.
    oauthIssuer?: string;
    oauthTokenEndpoint?: string;
    oauthScopes?: string[];
  };
}

// An OAuth variable that got tokens: a sign-in (`sign-in` the first time, `reconnect` when it replaced tokens) or tokens
// an API caller imported (`import`). Recorded only on success, and never with a token.
export interface AgentVaultOauthVariableConnectEvent {
  type: EventType.AGENT_VAULT_OAUTH_VARIABLE_CONNECT;
  metadata: {
    variableId: string;
    key: string;
    method: "sign-in" | "reconnect" | "import";
    oauthIssuer: string;
    oauthScopes: string[];
  };
}

export interface AgentVaultVariableValueViewEvent {
  type: EventType.AGENT_VAULT_VARIABLE_VALUE_VIEW;
  metadata: {
    accessBundleId?: string;
    accessBundleName?: string;
    variableId: string;
    key: string;
    // global, or personal for a variable only its owner sees and uses. Absent on events from before personal ones.
    scope?: string;
  };
}

// The personal values the actor set for a service that leaves some fields to each member. Field names only, never a value.
export interface AgentVaultPersonalValuesSetEvent {
  type: EventType.AGENT_VAULT_PERSONAL_VALUES_SET;
  metadata: {
    // Services belonged to one access bundle until they moved to the project, so these are present only on events
    // recorded before that.
    accessBundleId?: string;
    accessBundleName?: string;
    serviceId: string;
    serviceName: string;
    // Which credential the fields belong to: credential-value is a token for bearer and a password for basic.
    credentialType: string;
    // The fields this update set. A field it left out kept its saved value.
    fields: string[];
    variableKeys: string[];
    // Set when the member connected their own OAuth account.
    oauthIssuer?: string;
    oauthScopes?: string[];
  };
}

export interface AgentVaultPersonalValuesDeleteEvent {
  type: EventType.AGENT_VAULT_PERSONAL_VALUES_DELETE;
  metadata: {
    // Services belonged to one access bundle until they moved to the project, so these are present only on events
    // recorded before that.
    accessBundleId?: string;
    accessBundleName?: string;
    serviceId: string;
    serviceName: string;
    credentialType: string;
  };
}

export interface AgentVaultSkillCreateEvent {
  type: EventType.AGENT_VAULT_SKILL_CREATE;
  metadata: {
    skillId: string;
    skillName: string;
    version: number;
    sha256: string;
  };
}

export interface AgentVaultSkillVersionCreateEvent {
  type: EventType.AGENT_VAULT_SKILL_VERSION_CREATE;
  metadata: {
    skillId: string;
    skillName: string;
    version: number;
    sha256: string;
  };
}

export interface AgentVaultSkillRenameEvent {
  type: EventType.AGENT_VAULT_SKILL_RENAME;
  metadata: {
    skillId: string;
    oldName: string;
    newName: string;
  };
}

export interface AgentVaultSkillVersionRestoreEvent {
  type: EventType.AGENT_VAULT_SKILL_VERSION_RESTORE;
  metadata: {
    skillId: string;
    skillName: string;
    version: number;
    restoredFromVersion: number;
    sha256: string;
  };
}

export interface AgentVaultSkillVersionViewEvent {
  type: EventType.AGENT_VAULT_SKILL_VERSION_VIEW;
  metadata: {
    skillId: string;
    skillName: string;
    version: number;
  };
}

export interface AgentVaultSkillDeleteEvent {
  type: EventType.AGENT_VAULT_SKILL_DELETE;
  metadata: {
    skillId: string;
    skillName: string;
    // The access bundles the skill was in when it was deleted.
    removedFromBundles: { id: string; name: string }[];
  };
}

export interface AgentVaultHookCreateEvent {
  type: EventType.AGENT_VAULT_HOOK_CREATE;
  metadata: {
    hookId: string;
    hookName: string;
    url: string;
  };
}

export interface AgentVaultHookUpdateEvent {
  type: EventType.AGENT_VAULT_HOOK_UPDATE;
  metadata: {
    hookId: string;
    // The hook's name after the update; `name` is set only by a rename.
    hookName: string;
    name?: string;
    // Null when the update removed it.
    description?: string | null;
    url?: string;
    // Whether a new secret was saved. The secret itself is never recorded.
    secretReplaced: boolean;
  };
}

export interface AgentVaultHookDeleteEvent {
  type: EventType.AGENT_VAULT_HOOK_DELETE;
  metadata: {
    hookId: string;
    hookName: string;
    url: string;
    // The project's services that used the hook and are no longer checked by it.
    services: { id: string; name: string }[];
  };
}

export interface AgentVaultAccessBundleSkillAddEvent {
  type: EventType.AGENT_VAULT_ACCESS_BUNDLE_SKILL_ADD;
  metadata: {
    skillId: string;
    skillName: string;
    accessBundleId: string;
    accessBundleName: string;
  };
}

export interface AgentVaultAccessBundleSkillRemoveEvent {
  type: EventType.AGENT_VAULT_ACCESS_BUNDLE_SKILL_REMOVE;
  metadata: {
    skillId: string;
    skillName: string;
    accessBundleId: string;
    accessBundleName: string;
  };
}

export interface AgentVaultAccessBundleServiceAddEvent {
  type: EventType.AGENT_VAULT_ACCESS_BUNDLE_SERVICE_ADD;
  metadata: {
    serviceId: string;
    serviceName: string;
    accessBundleId: string;
    accessBundleName: string;
  };
}

// The service stays in the project. Personal values of members who reached it only through this bundle are deleted.
export interface AgentVaultAccessBundleServiceRemoveEvent {
  type: EventType.AGENT_VAULT_ACCESS_BUNDLE_SERVICE_REMOVE;
  metadata: {
    serviceId: string;
    serviceName: string;
    accessBundleId: string;
    accessBundleName: string;
  };
}

// Recorded once per fetch when the CLI gets a session's skills at agent start, not when the agent reads them.
export interface AgentVaultSkillsDeliveredEvent {
  type: EventType.AGENT_VAULT_SKILLS_DELIVERED;
  metadata: {
    sessionId: string;
    // The session's access bundle, when any skill delivered came through it.
    accessBundleId: string | null;
    accessBundleName: string | null;
    skills: {
      skillId: string;
      skillName: string;
      version: number;
      sha256: string;
      // Null for a skill the session lists by name or was sent with, rather than one it got through its access bundle.
      accessBundleId: string | null;
      accessBundleName: string | null;
      isInline: boolean;
    }[];
    // Set when the machine identity in the actor started the session on this user's behalf.
    onBehalfOfUserId?: string;
    onBehalfOfUserName?: string;
    onBehalfOfUserEmail?: string;
  };
}

export interface AgentVaultProductMemberAddEvent {
  type: EventType.AGENT_VAULT_MEMBER_ADD;
  metadata: {
    userId?: string;
    userName?: string;
    userEmail?: string;
    groupId?: string;
    groupName?: string;
    machineIdentityId?: string;
    machineIdentityName?: string;
    role: string;
  };
}

export interface AgentVaultProductMemberUpdateEvent {
  type: EventType.AGENT_VAULT_MEMBER_UPDATE;
  metadata: {
    userId?: string;
    userName?: string;
    userEmail?: string;
    groupId?: string;
    groupName?: string;
    machineIdentityId?: string;
    machineIdentityName?: string;
    role: string;
  };
}

export interface AgentVaultProductMemberRemoveEvent {
  type: EventType.AGENT_VAULT_MEMBER_REMOVE;
  metadata: {
    userId?: string;
    userName?: string;
    userEmail?: string;
    groupId?: string;
    groupName?: string;
    machineIdentityId?: string;
    machineIdentityName?: string;
  };
}

export interface AgentVaultAccessBundleMemberAddEvent {
  type: EventType.AGENT_VAULT_ACCESS_BUNDLE_MEMBER_ADD;
  metadata: {
    accessBundleId: string;
    accessBundleName: string;
    userId?: string;
    userName?: string;
    userEmail?: string;
    groupId?: string;
    groupName?: string;
    machineIdentityId?: string;
    machineIdentityName?: string;
  };
}

export interface AgentVaultAccessBundleMemberRemoveEvent {
  type: EventType.AGENT_VAULT_ACCESS_BUNDLE_MEMBER_REMOVE;
  metadata: {
    accessBundleId: string;
    accessBundleName: string;
    userId?: string;
    userName?: string;
    userEmail?: string;
    groupId?: string;
    groupName?: string;
    machineIdentityId?: string;
    machineIdentityName?: string;
  };
}

export interface AgentVaultSessionMintEvent {
  type: EventType.AGENT_VAULT_SESSION_MINT;
  metadata: {
    sessionId: string;
    label: string | null;
    // The session's own key/value metadata. Set when the session was created with some.
    metadata?: Record<string, string>;
    // Null for a session started without an access bundle.
    accessBundleId: string | null;
    accessBundleName: string | null;
    expiresAt: string | null;
    // Set when the session has skills besides its access bundle's, in the order they were sent, the same way as the
    // API's. One sent inline also carries the hash and size of its files, never the files.
    skills?: (
      | { skillId: string; name: string; isInline: false }
      | {
          skillId: string;
          name: string;
          isInline: true;
          description: string;
          sha256: string;
          sizeBytes: number;
          fileCount: number;
        }
    )[];
    // Set when the session has services besides its access bundle's, in the order they were sent, the same way as the
    // API's. One an admin sent inline also carries what it was sent with, never its values.
    services?: (
      | { serviceId: string; name: string; isInline: false }
      | {
          serviceId: string;
          // The name it was sent with, or its first host when it was sent without one.
          name: string;
          isInline: true;
          description?: string | null;
          serviceType: string;
          serverUrl?: string;
          transport?: string;
          // Absent for a database or SSH service, which reports host, port and database instead.
          hostPattern?: string;
          host?: string;
          port?: number;
          database?: string;
          tlsEnabled?: boolean;
          tlsVerify?: boolean;
          // Whether the proxy checks the server's certificate against a CA sent with the service rather than the system's.
          hasTlsCa?: boolean;
          credentialType: string;
          headerName?: string;
          // OAuth only: the OAuth variable whose sign-in the service sends, or the issuer of tokens sent with the session.
          oauthVariable?: { id: string; key: string };
          oauthIssuer?: string;
          allowedMethods: string[] | null;
          allowedPathPrefixes: string[] | null;
          // Absent for every type but MCP. Null when the agent can call every tool.
          allowedTools?: string[] | null;
          customHeaderNames: string[];
          substitutionPlaceholders: string[];
          // The saved hook the service was sent with and what it checks of the service.
          hook?: TAgentVaultServiceHookAudit;
          // Present only on events recorded before hooks became their own resource.
          hookUrl?: string;
        }
    )[];
    // Set when a machine identity started the session on this user's behalf.
    onBehalfOfUserId?: string;
    onBehalfOfUserName?: string;
    onBehalfOfUserEmail?: string;
  };
}

export interface AgentVaultSessionUpdateEvent {
  type: EventType.AGENT_VAULT_SESSION_UPDATE;
  metadata: {
    sessionId: string;
    label: string | null;
    previousLabel: string | null;
    // The session's own key/value metadata after the update.
    metadata?: Record<string, string>;
    sessionOwner: string;
    accessBundleName: string | null;
    // Set when the machine identity in sessionOwner started the session on this user's behalf.
    onBehalfOfUserId?: string;
    onBehalfOfUserName?: string;
    onBehalfOfUserEmail?: string;
  };
}

export interface AgentVaultSessionRevokeEvent {
  type: EventType.AGENT_VAULT_SESSION_REVOKE;
  metadata: {
    sessionId: string;
    label: string | null;
    sessionOwner: string;
    accessBundleName: string | null;
    // Set when the session was ended with its own token rather than by a signed-in user or identity.
    revokedWithToken?: boolean;
    // Set when the machine identity in sessionOwner started the session on this user's behalf.
    onBehalfOfUserId?: string;
    onBehalfOfUserName?: string;
    onBehalfOfUserEmail?: string;
  };
}

export interface AgentVaultDelegationSetEvent {
  type: EventType.AGENT_VAULT_DELEGATION_SET;
  metadata: {
    machineIdentityId: string;
    machineIdentityName: string;
    scope: string;
    users: { userId: string; userName: string }[];
    groups: { groupId: string; groupName: string }[];
  };
}

export interface AgentVaultDelegationDeleteEvent {
  type: EventType.AGENT_VAULT_DELEGATION_DELETE;
  metadata: {
    machineIdentityId: string;
    machineIdentityName: string;
    scope: string;
    users: { userId: string; userName: string }[];
    groups: { groupId: string; groupName: string }[];
  };
}

export interface CreateProxiedServiceEvent {
  type: EventType.CREATE_PROXIED_SERVICE;
  metadata: {
    proxiedServiceId: string;
    name: string;
    hostPattern: string;
    // secret / dynamic secret names only; never placeholder/secret/lease values
    secretKeys: string[];
    dynamicSecretNames: string[];
    environment: string;
    secretPath: string;
  };
}

export interface UpdateProxiedServiceEvent {
  type: EventType.UPDATE_PROXIED_SERVICE;
  metadata: {
    proxiedServiceId: string;
    name: string;
    hostPattern: string;
    updatedFields: string[];
    secretKeys: string[];
    dynamicSecretNames: string[];
    environment: string;
    secretPath: string;
  };
}

export interface DeleteProxiedServiceEvent {
  type: EventType.DELETE_PROXIED_SERVICE;
  metadata: {
    proxiedServiceId: string;
    name: string;
    environment: string;
    secretPath: string;
  };
}

export interface SignAgentProxyIntermediateCaEvent {
  type: EventType.SIGN_AGENT_PROXY_INTERMEDIATE_CA;
  metadata: {
    serialNumber: string;
    expiration: string;
  };
}

export type TAgentVaultAuditLogEvent =
  | AgentVaultProxyRegisterEvent
  | AgentVaultProxyTokenReissueEvent
  | AgentVaultProxyTokenRotateEvent
  | AgentVaultProxyEnrollEvent
  | AgentVaultProxyUpdateEvent
  | AgentVaultProxyRevokeEvent
  | AgentVaultProxyDeleteEvent
  | AgentVaultSessionLogSettingsUpdateEvent
  | AgentVaultAccessBundleCreateEvent
  | AgentVaultAccessBundleUpdateEvent
  | AgentVaultAccessBundleDeleteEvent
  | AgentVaultServiceCreateEvent
  | AgentVaultServiceUpdateEvent
  | AgentVaultServiceDeleteEvent
  | AgentVaultVariableCreateEvent
  | AgentVaultVariableUpdateEvent
  | AgentVaultVariableDeleteEvent
  | AgentVaultOauthVariableConnectEvent
  | AgentVaultVariableValueViewEvent
  | AgentVaultPersonalValuesSetEvent
  | AgentVaultPersonalValuesDeleteEvent
  | AgentVaultSkillCreateEvent
  | AgentVaultSkillVersionCreateEvent
  | AgentVaultSkillRenameEvent
  | AgentVaultSkillVersionRestoreEvent
  | AgentVaultSkillVersionViewEvent
  | AgentVaultSkillDeleteEvent
  | AgentVaultHookCreateEvent
  | AgentVaultHookUpdateEvent
  | AgentVaultHookDeleteEvent
  | AgentVaultAccessBundleSkillAddEvent
  | AgentVaultAccessBundleSkillRemoveEvent
  | AgentVaultAccessBundleServiceAddEvent
  | AgentVaultAccessBundleServiceRemoveEvent
  | AgentVaultSkillsDeliveredEvent
  | AgentVaultProductMemberAddEvent
  | AgentVaultProductMemberUpdateEvent
  | AgentVaultProductMemberRemoveEvent
  | AgentVaultAccessBundleMemberAddEvent
  | AgentVaultAccessBundleMemberRemoveEvent
  | AgentVaultSessionMintEvent
  | AgentVaultSessionUpdateEvent
  | AgentVaultSessionRevokeEvent
  | AgentVaultDelegationSetEvent
  | AgentVaultDelegationDeleteEvent
  | CreateProxiedServiceEvent
  | UpdateProxiedServiceEvent
  | DeleteProxiedServiceEvent
  | SignAgentProxyIntermediateCaEvent;
