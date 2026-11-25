import { EventType } from "../event-type";
import type { TAuditLogTrustedIp } from "./shared";

export interface LoginIdentityUniversalAuthEvent {
  type: EventType.LOGIN_IDENTITY_UNIVERSAL_AUTH;
  metadata: {
    identityId: string;
    identityUniversalAuthId: string;
    clientSecretId: string;
    identityAccessTokenId: string;
  };
}

export interface LoginIdentityUniversalAuthFailedEvent {
  type: EventType.LOGIN_IDENTITY_UNIVERSAL_AUTH_FAILED;
  metadata: {
    clientId: string;
    identityId: string | null;
    reasonCode: string;
    message: string;
  };
}

export interface MachineIdentityAuthTemplateCreateEvent {
  type: EventType.MACHINE_IDENTITY_AUTH_TEMPLATE_CREATE;
  metadata: {
    templateId: string;
    name: string;
  };
}

export interface MachineIdentityAuthTemplateUpdateEvent {
  type: EventType.MACHINE_IDENTITY_AUTH_TEMPLATE_UPDATE;
  metadata: {
    templateId: string;
    name: string;
  };
}

export interface MachineIdentityAuthTemplateDeleteEvent {
  type: EventType.MACHINE_IDENTITY_AUTH_TEMPLATE_DELETE;
  metadata: {
    templateId: string;
    name: string;
  };
}

export interface AddIdentityUniversalAuthEvent {
  type: EventType.ADD_IDENTITY_UNIVERSAL_AUTH;
  metadata: {
    identityId: string;
    clientSecretTrustedIps: Array<TAuditLogTrustedIp>;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    accessTokenTrustedIps: Array<TAuditLogTrustedIp>;
    lockoutEnabled: boolean;
    lockoutThreshold: number;
    lockoutDurationSeconds: number;
    lockoutCounterResetSeconds: number;
  };
}

export interface UpdateIdentityUniversalAuthEvent {
  type: EventType.UPDATE_IDENTITY_UNIVERSAL_AUTH;
  metadata: {
    identityId: string;
    clientSecretTrustedIps?: Array<TAuditLogTrustedIp>;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TAuditLogTrustedIp>;
    lockoutEnabled?: boolean;
    lockoutThreshold?: number;
    lockoutDurationSeconds?: number;
    lockoutCounterResetSeconds?: number;
  };
}

export interface GetIdentityUniversalAuthEvent {
  type: EventType.GET_IDENTITY_UNIVERSAL_AUTH;
  metadata: {
    identityId: string;
  };
}

export interface DeleteIdentityUniversalAuthEvent {
  type: EventType.REVOKE_IDENTITY_UNIVERSAL_AUTH;
  metadata: {
    identityId: string;
  };
}

export interface CreateTokenIdentityTokenAuthEvent {
  type: EventType.CREATE_TOKEN_IDENTITY_TOKEN_AUTH;
  metadata: {
    identityId: string;
    identityAccessTokenId: string;
  };
}

export interface UpdateTokenIdentityTokenAuthEvent {
  type: EventType.UPDATE_TOKEN_IDENTITY_TOKEN_AUTH;
  metadata: {
    identityId: string;
    tokenId: string;
    name?: string;
  };
}

export interface GetTokensIdentityTokenAuthEvent {
  type: EventType.GET_TOKENS_IDENTITY_TOKEN_AUTH;
  metadata: {
    identityId: string;
  };
}

export interface GetTokenIdentityTokenAuthEvent {
  type: EventType.GET_TOKEN_IDENTITY_TOKEN_AUTH;
  metadata: {
    identityId: string;
    identityName: string;
    tokenId: string;
  };
}

export interface AddIdentityTokenAuthEvent {
  type: EventType.ADD_IDENTITY_TOKEN_AUTH;
  metadata: {
    identityId: string;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    accessTokenTrustedIps: Array<TAuditLogTrustedIp>;
  };
}

export interface UpdateIdentityTokenAuthEvent {
  type: EventType.UPDATE_IDENTITY_TOKEN_AUTH;
  metadata: {
    identityId: string;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TAuditLogTrustedIp>;
  };
}

export interface GetIdentityTokenAuthEvent {
  type: EventType.GET_IDENTITY_TOKEN_AUTH;
  metadata: {
    identityId: string;
  };
}

export interface DeleteIdentityTokenAuthEvent {
  type: EventType.REVOKE_IDENTITY_TOKEN_AUTH;
  metadata: {
    identityId: string;
  };
}

export interface LoginIdentityKubernetesAuthEvent {
  type: EventType.LOGIN_IDENTITY_KUBERNETES_AUTH;
  metadata: {
    identityId: string;
    identityKubernetesAuthId: string;
    identityAccessTokenId: string;
  };
}

export interface LoginIdentityKubernetesAuthFailedEvent {
  type: EventType.LOGIN_IDENTITY_KUBERNETES_AUTH_FAILED;
  metadata: {
    identityId: string | null;
    reasonCode: string;
    message: string;
  };
}

export interface AddIdentityKubernetesAuthEvent {
  type: EventType.ADD_IDENTITY_KUBERNETES_AUTH;
  metadata: {
    identityId: string;
    templateId?: string | null;
    kubernetesHost: string;
    allowedNamespaces: string;
    allowedNames: string;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    accessTokenTrustedIps: Array<TAuditLogTrustedIp>;
  };
}

export interface DeleteIdentityKubernetesAuthEvent {
  type: EventType.REVOKE_IDENTITY_KUBERNETES_AUTH;
  metadata: {
    identityId: string;
  };
}

export interface UpdateIdentityKubernetesAuthEvent {
  type: EventType.UPDATE_IDENTITY_KUBENETES_AUTH;
  metadata: {
    identityId: string;
    identityName?: string;
    kubernetesHost?: string;
    allowedNamespaces?: string;
    allowedNames?: string;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TAuditLogTrustedIp>;
    templateId?: string | null;
    templateName?: string;
  };
}

export interface GetIdentityKubernetesAuthEvent {
  type: EventType.GET_IDENTITY_KUBERNETES_AUTH;
  metadata: {
    identityId: string;
  };
}

export interface CreateIdentityUniversalAuthClientSecretEvent {
  type: EventType.CREATE_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRET;
  metadata: {
    identityId: string;
    clientSecretId: string;
  };
}

export interface GetIdentityUniversalAuthClientSecretsEvent {
  type: EventType.GET_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRETS;
  metadata: {
    identityId: string;
  };
}

export interface GetIdentityUniversalAuthClientSecretByIdEvent {
  type: EventType.GET_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRET_BY_ID;
  metadata: {
    identityId: string;
    clientSecretId: string;
  };
}

export interface RevokeIdentityUniversalAuthClientSecretEvent {
  type: EventType.REVOKE_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRET;
  metadata: {
    identityId: string;
    clientSecretId: string;
  };
}

export interface ClearIdentityUniversalAuthLockoutsEvent {
  type: EventType.CLEAR_IDENTITY_UNIVERSAL_AUTH_LOCKOUTS;
  metadata: {
    identityId: string;
  };
}

export interface LoginIdentityGcpAuthEvent {
  type: EventType.LOGIN_IDENTITY_GCP_AUTH;
  metadata: {
    identityId: string;
    identityGcpAuthId: string;
    identityAccessTokenId: string;
  };
}

export interface LoginIdentityGcpAuthFailedEvent {
  type: EventType.LOGIN_IDENTITY_GCP_AUTH_FAILED;
  metadata: {
    identityId: string | null;
    reasonCode: string;
    message: string;
  };
}

export interface AddIdentityGcpAuthEvent {
  type: EventType.ADD_IDENTITY_GCP_AUTH;
  metadata: {
    identityId: string;
    type: string;
    allowedServiceAccounts?: string | null;
    allowedProjects?: string | null;
    allowedZones?: string | null;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    accessTokenTrustedIps: Array<TAuditLogTrustedIp>;
  };
}

export interface DeleteIdentityGcpAuthEvent {
  type: EventType.REVOKE_IDENTITY_GCP_AUTH;
  metadata: {
    identityId: string;
  };
}

export interface UpdateIdentityGcpAuthEvent {
  type: EventType.UPDATE_IDENTITY_GCP_AUTH;
  metadata: {
    identityId: string;
    type?: string;
    allowedServiceAccounts?: string | null;
    allowedProjects?: string | null;
    allowedZones?: string | null;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TAuditLogTrustedIp>;
  };
}

export interface GetIdentityGcpAuthEvent {
  type: EventType.GET_IDENTITY_GCP_AUTH;
  metadata: {
    identityId: string;
  };
}

export interface LoginIdentityAwsAuthEvent {
  type: EventType.LOGIN_IDENTITY_AWS_AUTH;
  metadata: {
    identityId: string;
    identityAwsAuthId: string;
    identityAccessTokenId: string;
  };
}

export interface LoginIdentityAwsAuthFailedEvent {
  type: EventType.LOGIN_IDENTITY_AWS_AUTH_FAILED;
  metadata: {
    identityId: string | null;
    reasonCode: string;
    message: string;
  };
}

export interface AddIdentityAwsAuthEvent {
  type: EventType.ADD_IDENTITY_AWS_AUTH;
  metadata: {
    identityId: string;
    stsEndpoint: string;
    allowedPrincipalArns: string;
    allowedAccountIds: string;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    accessTokenTrustedIps: Array<TAuditLogTrustedIp>;
  };
}

export interface DeleteIdentityAwsAuthEvent {
  type: EventType.REVOKE_IDENTITY_AWS_AUTH;
  metadata: {
    identityId: string;
  };
}

export interface UpdateIdentityAwsAuthEvent {
  type: EventType.UPDATE_IDENTITY_AWS_AUTH;
  metadata: {
    identityId: string;
    stsEndpoint?: string;
    allowedPrincipalArns?: string;
    allowedAccountIds?: string;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TAuditLogTrustedIp>;
  };
}

export interface GetIdentityAwsAuthEvent {
  type: EventType.GET_IDENTITY_AWS_AUTH;
  metadata: {
    identityId: string;
  };
}

export interface LoginIdentityAliCloudAuthEvent {
  type: EventType.LOGIN_IDENTITY_ALICLOUD_AUTH;
  metadata: {
    identityId: string;
    identityAliCloudAuthId: string;
    identityAccessTokenId: string;
  };
}

export interface LoginIdentityAliCloudAuthFailedEvent {
  type: EventType.LOGIN_IDENTITY_ALICLOUD_AUTH_FAILED;
  metadata: {
    identityId: string | null;
    reasonCode: string;
    message: string;
  };
}

export interface AddIdentityAliCloudAuthEvent {
  type: EventType.ADD_IDENTITY_ALICLOUD_AUTH;
  metadata: {
    identityId: string;
    allowedArns: string;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    accessTokenTrustedIps: Array<TAuditLogTrustedIp>;
  };
}

export interface DeleteIdentityAliCloudAuthEvent {
  type: EventType.REVOKE_IDENTITY_ALICLOUD_AUTH;
  metadata: {
    identityId: string;
  };
}

export interface UpdateIdentityAliCloudAuthEvent {
  type: EventType.UPDATE_IDENTITY_ALICLOUD_AUTH;
  metadata: {
    identityId: string;
    allowedArns: string;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TAuditLogTrustedIp>;
  };
}

export interface GetIdentityAliCloudAuthEvent {
  type: EventType.GET_IDENTITY_ALICLOUD_AUTH;
  metadata: {
    identityId: string;
  };
}

export interface LoginIdentityOciAuthEvent {
  type: EventType.LOGIN_IDENTITY_OCI_AUTH;
  metadata: {
    identityId: string;
    identityOciAuthId: string;
    identityAccessTokenId: string;
  };
}

export interface LoginIdentityOciAuthFailedEvent {
  type: EventType.LOGIN_IDENTITY_OCI_AUTH_FAILED;
  metadata: {
    identityId: string | null;
    reasonCode: string;
    message: string;
  };
}

export interface AddIdentityOciAuthEvent {
  type: EventType.ADD_IDENTITY_OCI_AUTH;
  metadata: {
    identityId: string;
    tenancyOcid: string;
    allowedUsernames: string | null;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    accessTokenTrustedIps: Array<TAuditLogTrustedIp>;
  };
}

export interface DeleteIdentityOciAuthEvent {
  type: EventType.REVOKE_IDENTITY_OCI_AUTH;
  metadata: {
    identityId: string;
  };
}

export interface UpdateIdentityOciAuthEvent {
  type: EventType.UPDATE_IDENTITY_OCI_AUTH;
  metadata: {
    identityId: string;
    tenancyOcid?: string;
    allowedUsernames: string | null;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TAuditLogTrustedIp>;
  };
}

export interface GetIdentityOciAuthEvent {
  type: EventType.GET_IDENTITY_OCI_AUTH;
  metadata: {
    identityId: string;
  };
}

export interface LoginIdentityAzureAuthEvent {
  type: EventType.LOGIN_IDENTITY_AZURE_AUTH;
  metadata: {
    identityId: string;
    identityAzureAuthId: string;
    identityAccessTokenId: string;
  };
}

export interface LoginIdentityAzureAuthFailedEvent {
  type: EventType.LOGIN_IDENTITY_AZURE_AUTH_FAILED;
  metadata: {
    identityId: string | null;
    reasonCode: string;
    message: string;
  };
}

export interface AddIdentityAzureAuthEvent {
  type: EventType.ADD_IDENTITY_AZURE_AUTH;
  metadata: {
    identityId: string;
    tenantId: string;
    resource: string;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    accessTokenTrustedIps: Array<TAuditLogTrustedIp>;
  };
}

export interface DeleteIdentityAzureAuthEvent {
  type: EventType.REVOKE_IDENTITY_AZURE_AUTH;
  metadata: {
    identityId: string;
  };
}

export interface UpdateIdentityAzureAuthEvent {
  type: EventType.UPDATE_IDENTITY_AZURE_AUTH;
  metadata: {
    identityId: string;
    tenantId?: string;
    resource?: string;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TAuditLogTrustedIp>;
  };
}

export interface GetIdentityAzureAuthEvent {
  type: EventType.GET_IDENTITY_AZURE_AUTH;
  metadata: {
    identityId: string;
  };
}

export interface LoginIdentityLdapAuthEvent {
  type: EventType.LOGIN_IDENTITY_LDAP_AUTH;
  metadata: {
    identityId: string;
    ldapUsername: string;
    ldapEmail?: string;
  };
}

export interface LoginIdentityLdapAuthFailedEvent {
  type: EventType.LOGIN_IDENTITY_LDAP_AUTH_FAILED;
  metadata: {
    identityId: string | null;
    reasonCode: string;
    message: string;
  };
}

export interface AddIdentityLdapAuthEvent {
  type: EventType.ADD_IDENTITY_LDAP_AUTH;
  metadata: {
    identityId: string;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TAuditLogTrustedIp>;
    allowedFields?: TAuditLogAllowedField[];
    url: string;
    templateId?: string | null;
    lockoutEnabled: boolean;
    lockoutThreshold: number;
    lockoutDurationSeconds: number;
    lockoutCounterResetSeconds: number;
  };
}

export interface UpdateIdentityLdapAuthEvent {
  type: EventType.UPDATE_IDENTITY_LDAP_AUTH;
  metadata: {
    identityId: string;
    identityName?: string;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TAuditLogTrustedIp>;
    allowedFields?: TAuditLogAllowedField[];
    url?: string;
    templateId?: string | null;
    templateName?: string;
    lockoutEnabled?: boolean;
    lockoutThreshold?: number;
    lockoutDurationSeconds?: number;
    lockoutCounterResetSeconds?: number;
  };
}

export interface GetIdentityLdapAuthEvent {
  type: EventType.GET_IDENTITY_LDAP_AUTH;
  metadata: {
    identityId: string;
  };
}

export interface RevokeIdentityLdapAuthEvent {
  type: EventType.REVOKE_IDENTITY_LDAP_AUTH;
  metadata: {
    identityId: string;
  };
}

export interface ClearIdentityLdapAuthLockoutsEvent {
  type: EventType.CLEAR_IDENTITY_LDAP_AUTH_LOCKOUTS;
  metadata: {
    identityId: string;
  };
}

export interface LoginIdentityOidcAuthEvent {
  type: EventType.LOGIN_IDENTITY_OIDC_AUTH;
  metadata: {
    identityId: string;
    identityOidcAuthId: string;
    identityAccessTokenId: string;
    oidcClaimsReceived: Record<string, unknown>;
  };
}

export interface LoginIdentityOidcAuthFailedEvent {
  type: EventType.LOGIN_IDENTITY_OIDC_AUTH_FAILED;
  metadata: {
    identityId: string | null;
    reasonCode: string;
    message: string;
  };
}

export interface AddIdentityOidcAuthEvent {
  type: EventType.ADD_IDENTITY_OIDC_AUTH;
  metadata: {
    identityId: string;
    templateId?: string | null;
    templateName?: string;
    oidcDiscoveryUrl: string;
    caCert: string;
    boundIssuer: string;
    boundAudiences: string;
    boundClaims: Record<string, string>;
    claimMetadataMapping: Record<string, string>;
    boundSubject: string;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    accessTokenTrustedIps: Array<TAuditLogTrustedIp>;
  };
}

export interface DeleteIdentityOidcAuthEvent {
  type: EventType.REVOKE_IDENTITY_OIDC_AUTH;
  metadata: {
    identityId: string;
  };
}

export interface UpdateIdentityOidcAuthEvent {
  type: EventType.UPDATE_IDENTITY_OIDC_AUTH;
  metadata: {
    identityId: string;
    identityName?: string;
    templateId?: string | null;
    templateName?: string;
    oidcDiscoveryUrl?: string;
    caCert?: string;
    boundIssuer?: string;
    boundAudiences?: string;
    boundClaims?: Record<string, string>;
    claimMetadataMapping?: Record<string, string>;
    boundSubject?: string;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TAuditLogTrustedIp>;
  };
}

export interface GetIdentityOidcAuthEvent {
  type: EventType.GET_IDENTITY_OIDC_AUTH;
  metadata: {
    identityId: string;
  };
}

export interface LoginIdentityJwtAuthEvent {
  type: EventType.LOGIN_IDENTITY_JWT_AUTH;
  metadata: {
    identityId: string;
    identityJwtAuthId: string;
    identityAccessTokenId: string;
  };
}

export interface LoginIdentityJwtAuthFailedEvent {
  type: EventType.LOGIN_IDENTITY_JWT_AUTH_FAILED;
  metadata: {
    identityId: string | null;
    reasonCode: string;
    message: string;
  };
}

export interface AddIdentityJwtAuthEvent {
  type: EventType.ADD_IDENTITY_JWT_AUTH;
  metadata: {
    identityId: string;
    configurationType: string;
    jwksUrl?: string;
    jwksCaCert: string;
    publicKeys: string[];
    boundIssuer: string;
    boundAudiences: string;
    boundClaims: Record<string, string>;
    boundSubject: string;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    accessTokenTrustedIps: Array<TAuditLogTrustedIp>;
  };
}

export interface UpdateIdentityJwtAuthEvent {
  type: EventType.UPDATE_IDENTITY_JWT_AUTH;
  metadata: {
    identityId: string;
    configurationType?: string;
    jwksUrl?: string;
    jwksCaCert?: string;
    publicKeys?: string[];
    boundIssuer?: string;
    boundAudiences?: string;
    boundClaims?: Record<string, string>;
    boundSubject?: string;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TAuditLogTrustedIp>;
  };
}

export interface DeleteIdentityJwtAuthEvent {
  type: EventType.REVOKE_IDENTITY_JWT_AUTH;
  metadata: {
    identityId: string;
  };
}

export interface GetIdentityJwtAuthEvent {
  type: EventType.GET_IDENTITY_JWT_AUTH;
  metadata: {
    identityId: string;
  };
}

export interface LoginIdentitySpiffeAuthEvent {
  type: EventType.LOGIN_IDENTITY_SPIFFE_AUTH;
  metadata: {
    identityId: string;
    identitySpiffeAuthId: string;
    identityAccessTokenId: string;
  };
}

export interface LoginIdentitySpiffeAuthFailedEvent {
  type: EventType.LOGIN_IDENTITY_SPIFFE_AUTH_FAILED;
  metadata: {
    identityId: string | null;
    reasonCode: string;
    message: string;
  };
}

export interface AddIdentitySpiffeAuthEvent {
  type: EventType.ADD_IDENTITY_SPIFFE_AUTH;
  metadata: {
    identityId: string;
    trustDomain: string;
    allowedSpiffeIds: string;
    allowedAudiences: string;
    configurationType: string;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    accessTokenTrustedIps: Array<TAuditLogTrustedIp>;
  };
}

export interface UpdateIdentitySpiffeAuthEvent {
  type: EventType.UPDATE_IDENTITY_SPIFFE_AUTH;
  metadata: {
    identityId: string;
    trustDomain?: string;
    allowedSpiffeIds?: string;
    allowedAudiences?: string;
    configurationType?: string;
    accessTokenTTL?: number;
    accessTokenMaxTTL?: number;
    accessTokenNumUsesLimit?: number;
    accessTokenTrustedIps?: Array<TAuditLogTrustedIp>;
  };
}

export interface DeleteIdentitySpiffeAuthEvent {
  type: EventType.REVOKE_IDENTITY_SPIFFE_AUTH;
  metadata: {
    identityId: string;
  };
}

export interface GetIdentitySpiffeAuthEvent {
  type: EventType.GET_IDENTITY_SPIFFE_AUTH;
  metadata: {
    identityId: string;
  };
}

export interface RefreshIdentitySpiffeAuthBundleEvent {
  type: EventType.REFRESH_IDENTITY_SPIFFE_AUTH_BUNDLE;
  metadata: {
    identityId: string;
  };
}

export type TAuditLogAllowedField = { key: string; value: string };

export type TIdentityAuthAuditLogEvent =
  | LoginIdentityUniversalAuthEvent
  | LoginIdentityUniversalAuthFailedEvent
  | MachineIdentityAuthTemplateCreateEvent
  | MachineIdentityAuthTemplateUpdateEvent
  | MachineIdentityAuthTemplateDeleteEvent
  | AddIdentityUniversalAuthEvent
  | UpdateIdentityUniversalAuthEvent
  | GetIdentityUniversalAuthEvent
  | DeleteIdentityUniversalAuthEvent
  | CreateTokenIdentityTokenAuthEvent
  | UpdateTokenIdentityTokenAuthEvent
  | GetTokensIdentityTokenAuthEvent
  | GetTokenIdentityTokenAuthEvent
  | AddIdentityTokenAuthEvent
  | UpdateIdentityTokenAuthEvent
  | GetIdentityTokenAuthEvent
  | DeleteIdentityTokenAuthEvent
  | LoginIdentityKubernetesAuthEvent
  | LoginIdentityKubernetesAuthFailedEvent
  | AddIdentityKubernetesAuthEvent
  | DeleteIdentityKubernetesAuthEvent
  | UpdateIdentityKubernetesAuthEvent
  | GetIdentityKubernetesAuthEvent
  | CreateIdentityUniversalAuthClientSecretEvent
  | GetIdentityUniversalAuthClientSecretsEvent
  | GetIdentityUniversalAuthClientSecretByIdEvent
  | RevokeIdentityUniversalAuthClientSecretEvent
  | ClearIdentityUniversalAuthLockoutsEvent
  | LoginIdentityGcpAuthEvent
  | LoginIdentityGcpAuthFailedEvent
  | AddIdentityGcpAuthEvent
  | DeleteIdentityGcpAuthEvent
  | UpdateIdentityGcpAuthEvent
  | GetIdentityGcpAuthEvent
  | LoginIdentityAwsAuthEvent
  | LoginIdentityAwsAuthFailedEvent
  | AddIdentityAwsAuthEvent
  | DeleteIdentityAwsAuthEvent
  | UpdateIdentityAwsAuthEvent
  | GetIdentityAwsAuthEvent
  | LoginIdentityAliCloudAuthEvent
  | LoginIdentityAliCloudAuthFailedEvent
  | AddIdentityAliCloudAuthEvent
  | DeleteIdentityAliCloudAuthEvent
  | UpdateIdentityAliCloudAuthEvent
  | GetIdentityAliCloudAuthEvent
  | LoginIdentityOciAuthEvent
  | LoginIdentityOciAuthFailedEvent
  | AddIdentityOciAuthEvent
  | DeleteIdentityOciAuthEvent
  | UpdateIdentityOciAuthEvent
  | GetIdentityOciAuthEvent
  | LoginIdentityAzureAuthEvent
  | LoginIdentityAzureAuthFailedEvent
  | AddIdentityAzureAuthEvent
  | DeleteIdentityAzureAuthEvent
  | UpdateIdentityAzureAuthEvent
  | GetIdentityAzureAuthEvent
  | LoginIdentityLdapAuthEvent
  | LoginIdentityLdapAuthFailedEvent
  | AddIdentityLdapAuthEvent
  | UpdateIdentityLdapAuthEvent
  | GetIdentityLdapAuthEvent
  | RevokeIdentityLdapAuthEvent
  | ClearIdentityLdapAuthLockoutsEvent
  | LoginIdentityOidcAuthEvent
  | LoginIdentityOidcAuthFailedEvent
  | AddIdentityOidcAuthEvent
  | DeleteIdentityOidcAuthEvent
  | UpdateIdentityOidcAuthEvent
  | GetIdentityOidcAuthEvent
  | LoginIdentityJwtAuthEvent
  | LoginIdentityJwtAuthFailedEvent
  | AddIdentityJwtAuthEvent
  | UpdateIdentityJwtAuthEvent
  | DeleteIdentityJwtAuthEvent
  | GetIdentityJwtAuthEvent
  | LoginIdentitySpiffeAuthEvent
  | LoginIdentitySpiffeAuthFailedEvent
  | AddIdentitySpiffeAuthEvent
  | UpdateIdentitySpiffeAuthEvent
  | DeleteIdentitySpiffeAuthEvent
  | GetIdentitySpiffeAuthEvent
  | RefreshIdentitySpiffeAuthBundleEvent;
