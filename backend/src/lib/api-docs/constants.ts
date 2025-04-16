import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  SECRET_ROTATION_CONNECTION_MAP,
  SECRET_ROTATION_NAME_MAP
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-maps";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { APP_CONNECTION_NAME_MAP } from "@app/services/app-connection/app-connection-maps";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { SECRET_SYNC_CONNECTION_MAP, SECRET_SYNC_NAME_MAP } from "@app/services/secret-sync/secret-sync-maps";

export const GROUPS = {
  CREATE: {
    name: "The name of the group to create.",
    slug: "The slug of the group to create.",
    role: "The role of the group to create."
  },
  UPDATE: {
    id: "The ID of the group to update.",
    name: "The new name of the group to update to.",
    slug: "The new slug of the group to update to.",
    role: "The new role of the group to update to."
  },
  DELETE: {
    id: "The ID of the group to delete.",
    slug: "The slug of the group to delete."
  },
  LIST_USERS: {
    id: "The ID of the group to list users for.",
    offset: "The offset to start from. If you enter 10, it will start from the 10th user.",
    limit: "The number of users to return.",
    username: "The username to search for.",
    search: "The text string that user email or name will be filtered by.",
    filterUsers:
      "Whether to filter the list of returned users. 'existingMembers' will only return existing users in the group, 'nonMembers' will only return users not in the group, undefined will return all users in the organization."
  },
  ADD_USER: {
    id: "The ID of the group to add the user to.",
    username: "The username of the user to add to the group."
  },
  GET_BY_ID: {
    id: "The ID of the group to fetch."
  },
  DELETE_USER: {
    id: "The ID of the group to remove the user from.",
    username: "The username of the user to remove from the group."
  }
} as const;

export const IDENTITIES = {
  CREATE: {
    name: "The name of the identity to create.",
    organizationId: "The organization ID to which the identity belongs.",
    role: "The role of the identity. Possible values are 'no-access', 'member', and 'admin'."
  },
  UPDATE: {
    identityId: "The ID of the identity to update.",
    name: "The new name of the identity.",
    role: "The new role of the identity."
  },
  DELETE: {
    identityId: "The ID of the identity to delete."
  },
  GET_BY_ID: {
    identityId: "The ID of the identity to get details.",
    orgId: "The ID of the org of the identity"
  },
  LIST: {
    orgId: "The ID of the organization to list identities."
  },
  SEARCH: {
    search: {
      desc: "The filters to apply to the search.",
      name: "The name of the identity to filter by.",
      role: "The organizational role of the identity to filter by."
    },
    offset: "The offset to start from. If you enter 10, it will start from the 10th identity.",
    limit: "The number of identities to return.",
    orderBy: "The column to order identities by.",
    orderDirection: "The direction to order identities in."
  }
} as const;

export const UNIVERSAL_AUTH = {
  LOGIN: {
    clientId: "Your Machine Identity Client ID.",
    clientSecret: "Your Machine Identity Client Secret."
  },
  ATTACH: {
    identityId: "The ID of the identity to attach the configuration onto.",
    clientSecretTrustedIps:
      "A list of IPs or CIDR ranges that the Client Secret can be used from together with the Client ID to get back an access token. You can use 0.0.0.0/0, to allow usage from any network address.",
    accessTokenTrustedIps:
      "A list of IPs or CIDR ranges that access tokens can be used from. You can use 0.0.0.0/0, to allow usage from any network address.",
    accessTokenTTL: "The lifetime for an access token in seconds. This value will be referenced at renewal time.",
    accessTokenMaxTTL:
      "The maximum lifetime for an access token in seconds. This value will be referenced at renewal time.",
    accessTokenNumUsesLimit:
      "The maximum number of times that an access token can be used; a value of 0 implies infinite number of uses."
  },
  RETRIEVE: {
    identityId: "The ID of the identity to retrieve the auth method for."
  },
  REVOKE: {
    identityId: "The ID of the identity to revoke the auth method for."
  },
  UPDATE: {
    identityId: "The ID of the identity to update the auth method for.",
    clientSecretTrustedIps: "The new list of IPs or CIDR ranges that the Client Secret can be used from.",
    accessTokenTrustedIps: "The new list of IPs or CIDR ranges that access tokens can be used from.",
    accessTokenTTL: "The new lifetime for an access token in seconds.",
    accessTokenMaxTTL: "The new maximum lifetime for an access token in seconds.",
    accessTokenNumUsesLimit: "The new maximum number of times that an access token can be used."
  },
  CREATE_CLIENT_SECRET: {
    identityId: "The ID of the identity to create a client secret for.",
    description: "The description of the client secret.",
    numUsesLimit:
      "The maximum number of times that the client secret can be used; a value of 0 implies infinite number of uses.",
    ttl: "The lifetime for the client secret in seconds."
  },
  LIST_CLIENT_SECRETS: {
    identityId: "The ID of the identity to list client secrets for."
  },
  GET_CLIENT_SECRET: {
    identityId: "The ID of the identity to get the client secret from.",
    clientSecretId: "The ID of the client secret to get details."
  },
  REVOKE_CLIENT_SECRET: {
    identityId: "The ID of the identity to revoke the client secret from.",
    clientSecretId: "The ID of the client secret to revoke."
  },
  RENEW_ACCESS_TOKEN: {
    accessToken: "The access token to renew."
  },
  REVOKE_ACCESS_TOKEN: {
    accessToken: "The access token to revoke."
  }
} as const;

export const AWS_AUTH = {
  LOGIN: {
    identityId: "The ID of the identity to login.",
    iamHttpRequestMethod: "The HTTP request method used in the signed request.",
    iamRequestUrl:
      "The base64-encoded HTTP URL used in the signed request. Most likely, the base64-encoding of https://sts.amazonaws.com/.",
    iamRequestBody:
      "The base64-encoded body of the signed request. Most likely, the base64-encoding of Action=GetCallerIdentity&Version=2011-06-15.",
    iamRequestHeaders: "The base64-encoded headers of the sts:GetCallerIdentity signed request."
  },
  ATTACH: {
    identityId: "The ID of the identity to attach the configuration onto.",
    allowedPrincipalArns:
      "The comma-separated list of trusted IAM principal ARNs that are allowed to authenticate with Infisical.",
    allowedAccountIds:
      "The comma-separated list of trusted AWS account IDs that are allowed to authenticate with Infisical.",
    accessTokenTTL: "The lifetime for an access token in seconds.",
    accessTokenMaxTTL: "The maximum lifetime for an access token in seconds.",
    stsEndpoint: "The endpoint URL for the AWS STS API.",
    accessTokenNumUsesLimit: "The maximum number of times that an access token can be used.",
    accessTokenTrustedIps: "The IPs or CIDR ranges that access tokens can be used from."
  },
  UPDATE: {
    identityId: "The ID of the identity to update the auth method for.",
    allowedPrincipalArns:
      "The new comma-separated list of trusted IAM principal ARNs that are allowed to authenticate with Infisical.",
    allowedAccountIds:
      "The new comma-separated list of trusted AWS account IDs that are allowed to authenticate with Infisical.",
    accessTokenTTL: "The new lifetime for an access token in seconds.",
    accessTokenMaxTTL: "The new maximum lifetime for an access token in seconds.",
    stsEndpoint: "The new endpoint URL for the AWS STS API.",
    accessTokenNumUsesLimit: "The new maximum number of times that an access token can be used.",
    accessTokenTrustedIps: "The new IPs or CIDR ranges that access tokens can be used from."
  },
  RETRIEVE: {
    identityId: "The ID of the identity to retrieve the auth method for."
  },
  REVOKE: {
    identityId: "The ID of the identity to revoke the auth method for."
  }
} as const;

export const AZURE_AUTH = {
  LOGIN: {
    identityId: "The ID of the identity to login."
  },
  ATTACH: {
    identityId: "The ID of the identity to attach the configuration onto.",
    tenantId: "The tenant ID for the Azure AD organization.",
    resource: "The resource URL for the application registered in Azure AD.",
    allowedServicePrincipalIds:
      "The comma-separated list of Azure AD service principal IDs that are allowed to authenticate with Infisical.",
    accessTokenTrustedIps: "The IPs or CIDR ranges that access tokens can be used from.",
    accessTokenTTL: "The lifetime for an access token in seconds.",
    accessTokenMaxTTL: "The maximum lifetime for an access token in seconds.",
    accessTokenNumUsesLimit: "The maximum number of times that an access token can be used."
  },
  UPDATE: {
    identityId: "The ID of the identity to update the auth method for.",
    tenantId: "The new tenant ID for the Azure AD organization.",
    resource: "The new resource URL for the application registered in Azure AD.",
    allowedServicePrincipalIds:
      "The new comma-separated list of Azure AD service principal IDs that are allowed to authenticate with Infisical.",
    accessTokenTrustedIps: "The new IPs or CIDR ranges that access tokens can be used from.",
    accessTokenTTL: "The new lifetime for an access token in seconds.",
    accessTokenMaxTTL: "The new maximum lifetime for an access token in seconds.",
    accessTokenNumUsesLimit: "The new maximum number of times that an access token can be used."
  },
  RETRIEVE: {
    identityId: "The ID of the identity to retrieve the auth method for."
  },
  REVOKE: {
    identityId: "The ID of the identity to revoke the auth method for."
  }
} as const;

export const GCP_AUTH = {
  LOGIN: {
    identityId: "The ID of the identity to login."
  },
  ATTACH: {
    identityId: "The ID of the identity to attach the configuration onto.",
    allowedServiceAccounts:
      "The comma-separated list of trusted service account emails corresponding to the GCE resource(s) allowed to authenticate with Infisical.",
    allowedProjects:
      "The comma-separated list of trusted GCP projects that the GCE instance must belong to authenticate with Infisical.",
    allowedZones:
      "The comma-separated list of trusted zones that the GCE instances must belong to authenticate with Infisical.",
    accessTokenTrustedIps: "The IPs or CIDR ranges that access tokens can be used from.",
    accessTokenTTL: "The lifetime for an access token in seconds.",
    accessTokenMaxTTL: "The maximum lifetime for an access token in seconds.",
    accessTokenNumUsesLimit: "The maximum number of times that an access token can be used."
  },
  UPDATE: {
    identityId: "The ID of the identity to update the auth method for.",
    allowedServiceAccounts:
      "The new comma-separated list of trusted service account emails corresponding to the GCE resource(s) allowed to authenticate with Infisical.",
    allowedProjects:
      "The new comma-separated list of trusted GCP projects that the GCE instance must belong to authenticate with Infisical.",
    allowedZones:
      "The new comma-separated list of trusted zones that the GCE instances must belong to authenticate with Infisical.",
    accessTokenTrustedIps: "The new IPs or CIDR ranges that access tokens can be used from.",
    accessTokenTTL: "The new lifetime for an access token in seconds.",
    accessTokenMaxTTL: "The new maximum lifetime for an access token in seconds.",
    accessTokenNumUsesLimit: "The new maximum number of times that an access token can be used."
  },
  RETRIEVE: {
    identityId: "The ID of the identity to retrieve the auth method for."
  },
  REVOKE: {
    identityId: "The ID of the identity to revoke the auth method for."
  }
} as const;

export const KUBERNETES_AUTH = {
  LOGIN: {
    identityId: "The ID of the identity to login."
  },
  ATTACH: {
    identityId: "The ID of the identity to attach the configuration onto.",
    kubernetesHost: "The host string, host:port pair, or URL to the base of the Kubernetes API server.",
    caCert: "The PEM-encoded CA cert for the Kubernetes API server.",
    tokenReviewerJwt:
      "Optional JWT token for accessing Kubernetes TokenReview API. If provided, this long-lived token will be used to validate service account tokens during authentication. If omitted, the client's own JWT will be used instead, which requires the client to have the system:auth-delegator ClusterRole binding.",
    allowedNamespaces:
      "The comma-separated list of trusted namespaces that service accounts must belong to authenticate with Infisical.",
    allowedNames: "The comma-separated list of trusted service account names that can authenticate with Infisical.",
    allowedAudience:
      "The optional audience claim that the service account JWT token must have to authenticate with Infisical.",
    accessTokenTrustedIps: "The IPs or CIDR ranges that access tokens can be used from.",
    accessTokenTTL: "The lifetime for an access token in seconds.",
    accessTokenMaxTTL: "The maximum lifetime for an access token in seconds.",
    accessTokenNumUsesLimit: "The maximum number of times that an access token can be used."
  },
  UPDATE: {
    identityId: "The ID of the identity to update the auth method for.",
    kubernetesHost: "The new host string, host:port pair, or URL to the base of the Kubernetes API server.",
    caCert: "The new PEM-encoded CA cert for the Kubernetes API server.",
    tokenReviewerJwt:
      "Optional JWT token for accessing Kubernetes TokenReview API. If provided, this long-lived token will be used to validate service account tokens during authentication. If omitted, the client's own JWT will be used instead, which requires the client to have the system:auth-delegator ClusterRole binding.",
    allowedNamespaces:
      "The new comma-separated list of trusted namespaces that service accounts must belong to authenticate with Infisical.",
    allowedNames: "The new comma-separated list of trusted service account names that can authenticate with Infisical.",
    allowedAudience:
      "The new optional audience claim that the service account JWT token must have to authenticate with Infisical.",
    accessTokenTrustedIps: "The new IPs or CIDR ranges that access tokens can be used from.",
    accessTokenTTL: "The new lifetime for an acccess token in seconds.",
    accessTokenMaxTTL: "The new maximum lifetime for an acccess token in seconds.",
    accessTokenNumUsesLimit: "The new maximum number of times that an access token can be used."
  },
  RETRIEVE: {
    identityId: "The ID of the identity to retrieve the auth method for."
  },
  REVOKE: {
    identityId: "The ID of the identity to revoke the auth method for."
  }
} as const;

export const TOKEN_AUTH = {
  ATTACH: {
    identityId: "The ID of the identity to attach the configuration onto.",
    accessTokenTrustedIps: "The IPs or CIDR ranges that access tokens can be used from.",
    accessTokenTTL: "The lifetime for an access token in seconds.",
    accessTokenMaxTTL: "The maximum lifetime for an access token in seconds.",
    accessTokenNumUsesLimit: "The maximum number of times that an access token can be used."
  },
  UPDATE: {
    identityId: "The ID of the identity to update the auth method for.",
    accessTokenTrustedIps: "The new IPs or CIDR ranges that access tokens can be used from.",
    accessTokenTTL: "The new lifetime for an access token in seconds.",
    accessTokenMaxTTL: "The new maximum lifetime for an access token in seconds.",
    accessTokenNumUsesLimit: "The new maximum number of times that an access token can be used."
  },
  RETRIEVE: {
    identityId: "The ID of the identity to retrieve the auth method for."
  },
  REVOKE: {
    identityId: "The ID of the identity to revoke the auth method for."
  },
  GET_TOKENS: {
    identityId: "The ID of the identity to list token metadata for.",
    offset: "The offset to start from. If you enter 10, it will start from the 10th token.",
    limit: "The number of tokens to return."
  },
  CREATE_TOKEN: {
    identityId: "The ID of the identity to create the token for.",
    name: "The name of the token to create."
  },
  UPDATE_TOKEN: {
    tokenId: "The ID of the token to update metadata for.",
    name: "The name of the token to update to."
  },
  REVOKE_TOKEN: {
    tokenId: "The ID of the token to revoke."
  }
} as const;

export const OIDC_AUTH = {
  LOGIN: {
    identityId: "The ID of the identity to login."
  },
  ATTACH: {
    identityId: "The ID of the identity to attach the configuration onto.",
    oidcDiscoveryUrl: "The URL used to retrieve the OpenID Connect configuration from the identity provider.",
    caCert: "The PEM-encoded CA cert for establishing secure communication with the Identity Provider endpoints.",
    boundIssuer: "The unique identifier of the identity provider issuing the JWT.",
    boundAudiences: "The list of intended recipients.",
    boundClaims: "The attributes that should be present in the JWT for it to be valid.",
    claimMetadataMapping: "The attributes that should be present in the permission metadata from the JWT.",
    boundSubject: "The expected principal that is the subject of the JWT.",
    accessTokenTrustedIps: "The IPs or CIDR ranges that access tokens can be used from.",
    accessTokenTTL: "The lifetime for an access token in seconds.",
    accessTokenMaxTTL: "The maximum lifetime for an access token in seconds.",
    accessTokenNumUsesLimit: "The maximum number of times that an access token can be used."
  },
  UPDATE: {
    identityId: "The ID of the identity to update the auth method for.",
    oidcDiscoveryUrl: "The new URL used to retrieve the OpenID Connect configuration from the identity provider.",
    caCert: "The new PEM-encoded CA cert for establishing secure communication with the Identity Provider endpoints.",
    boundIssuer: "The new unique identifier of the identity provider issuing the JWT.",
    boundAudiences: "The new list of intended recipients.",
    boundClaims: "The new attributes that should be present in the JWT for it to be valid.",
    claimMetadataMapping: "The new attributes that should be present in the permission metadata from the JWT.",
    boundSubject: "The new expected principal that is the subject of the JWT.",
    accessTokenTrustedIps: "The new IPs or CIDR ranges that access tokens can be used from.",
    accessTokenTTL: "The new lifetime for an access token in seconds.",
    accessTokenMaxTTL: "The new maximum lifetime for an access token in seconds.",
    accessTokenNumUsesLimit: "The new maximum number of times that an access token can be used."
  },
  RETRIEVE: {
    identityId: "The ID of the identity to retrieve the auth method for."
  },
  REVOKE: {
    identityId: "The ID of the identity to revoke the auth method for."
  }
} as const;

export const JWT_AUTH = {
  LOGIN: {
    identityId: "The ID of the identity to login."
  },
  ATTACH: {
    identityId: "The ID of the identity to attach the configuration onto.",
    configurationType: "The configuration for validating JWTs. Must be one of: 'jwks', 'static'",
    jwksUrl:
      "The URL of the JWKS endpoint. Required if configurationType is 'jwks'. This endpoint must serve JSON Web Key Sets (JWKS) containing the public keys used to verify JWT signatures.",
    jwksCaCert: "The PEM-encoded CA certificate for validating the TLS connection to the JWKS endpoint.",
    publicKeys:
      "A list of PEM-encoded public keys used to verify JWT signatures. Required if configurationType is 'static'. Each key must be in RSA or ECDSA format and properly PEM-encoded with BEGIN/END markers.",
    boundIssuer: "The unique identifier of the JWT provider.",
    boundAudiences: "The list of intended recipients.",
    boundClaims: "The attributes that should be present in the JWT for it to be valid.",
    boundSubject: "The expected principal that is the subject of the JWT.",
    accessTokenTrustedIps: "The IPs or CIDR ranges that access tokens can be used from.",
    accessTokenTTL: "The lifetime for an access token in seconds.",
    accessTokenMaxTTL: "The maximum lifetime for an access token in seconds.",
    accessTokenNumUsesLimit: "The maximum number of times that an access token can be used."
  },
  UPDATE: {
    identityId: "The ID of the identity to update the auth method for.",
    configurationType: "The new configuration for validating JWTs. Must be one of: 'jwks', 'static'",
    jwksUrl:
      "The new URL of the JWKS endpoint. This endpoint must serve JSON Web Key Sets (JWKS) containing the public keys used to verify JWT signatures.",
    jwksCaCert: "The new PEM-encoded CA certificate for validating the TLS connection to the JWKS endpoint.",
    publicKeys:
      "A new list of PEM-encoded public keys used to verify JWT signatures. Each key must be in RSA or ECDSA format and properly PEM-encoded with BEGIN/END markers.",
    boundIssuer: "The new unique identifier of the JWT provider.",
    boundAudiences: "The new list of intended recipients.",
    boundClaims: "The new attributes that should be present in the JWT for it to be valid.",
    boundSubject: "The new expected principal that is the subject of the JWT.",
    accessTokenTrustedIps: "The new IPs or CIDR ranges that access tokens can be used from.",
    accessTokenTTL: "The new lifetime for an access token in seconds.",
    accessTokenMaxTTL: "The new maximum lifetime for an access token in seconds.",
    accessTokenNumUsesLimit: "The new maximum number of times that an access token can be used."
  },
  RETRIEVE: {
    identityId: "The ID of the identity to retrieve the auth method for."
  },
  REVOKE: {
    identityId: "The ID of the identity to revoke the auth method for."
  }
} as const;

export const ORGANIZATIONS = {
  LIST_USER_MEMBERSHIPS: {
    organizationId: "The ID of the organization to get memberships from."
  },
  GET_USER_MEMBERSHIP: {
    organizationId: "The ID of the organization to get the membership for.",
    membershipId: "The ID of the membership to get."
  },
  UPDATE_USER_MEMBERSHIP: {
    organizationId: "The ID of the organization to update the membership for.",
    membershipId: "The ID of the membership to update.",
    role: "The new role of the membership.",
    isActive: "The active status of the membership",
    metadata: {
      key: "The key for user metadata tag.",
      value: "The value for user metadata tag."
    }
  },
  DELETE_USER_MEMBERSHIP: {
    organizationId: "The ID of the organization to delete the membership from.",
    membershipId: "The ID of the membership to delete."
  },
  LIST_IDENTITY_MEMBERSHIPS: {
    orgId: "The ID of the organization to get identity memberships from.",
    offset: "The offset to start from. If you enter 10, it will start from the 10th identity membership.",
    limit: "The number of identity memberships to return.",
    orderBy: "The column to order identity memberships by.",
    orderDirection: "The direction identity memberships will be sorted in.",
    search: "The text string that identity membership names will be filtered by."
  },
  GET_PROJECTS: {
    organizationId: "The ID of the organization to get projects from.",
    type: "The type of project to filter by."
  },
  LIST_GROUPS: {
    organizationId: "The ID of the organization to list groups for."
  }
} as const;

export const PROJECTS = {
  CREATE: {
    organizationSlug: "The slug of the organization to create the project in.",
    projectName: "The name of the project to create.",
    projectDescription: "An optional description label for the project.",
    slug: "An optional slug for the project.",
    template: "The name of the project template, if specified, to apply to this project."
  },
  DELETE: {
    workspaceId: "The ID of the project to delete."
  },
  GET: {
    workspaceId: "The ID of the project."
  },
  UPDATE: {
    workspaceId: "The ID of the project to update.",
    name: "The new name of the project.",
    projectDescription: "An optional description label for the project.",
    autoCapitalization: "Disable or enable auto-capitalization for the project.",
    slug: "An optional slug for the project. (must be unique within the organization)"
  },
  GET_KEY: {
    workspaceId: "The ID of the project to get the key from."
  },
  GET_SNAPSHOTS: {
    workspaceId: "The ID of the project to get snapshots from.",
    environment: "The environment to get snapshots from.",
    path: "The secret path to get snapshots from.",
    offset: "The offset to start from. If you enter 10, it will start from the 10th snapshot.",
    limit: "The number of snapshots to return."
  },
  ROLLBACK_TO_SNAPSHOT: {
    secretSnapshotId: "The ID of the snapshot to rollback to."
  },
  ADD_GROUP_TO_PROJECT: {
    projectId: "The ID of the project to add the group to.",
    groupIdOrName: "The ID or name of the group to add to the project.",
    role: "The role for the group to assume in the project."
  },
  UPDATE_GROUP_IN_PROJECT: {
    projectId: "The ID of the project to update the group in.",
    groupId: "The ID of the group to update in the project.",
    roles: "A list of roles to update the group to."
  },
  REMOVE_GROUP_FROM_PROJECT: {
    projectId: "The ID of the project to delete the group from.",
    groupId: "The ID of the group to delete from the project."
  },
  LIST_GROUPS_IN_PROJECT: {
    projectId: "The ID of the project to list groups for."
  },
  LIST_INTEGRATION: {
    workspaceId: "The ID of the project to list integrations for."
  },
  LIST_INTEGRATION_AUTHORIZATION: {
    workspaceId: "The ID of the project to list integration auths for."
  },
  LIST_SSH_CAS: {
    projectId: "The ID of the project to list SSH CAs for."
  },
  LIST_SSH_HOSTS: {
    projectId: "The ID of the project to list SSH hosts for."
  },
  LIST_SSH_CERTIFICATES: {
    projectId: "The ID of the project to list SSH certificates for.",
    offset: "The offset to start from. If you enter 10, it will start from the 10th SSH certificate.",
    limit: "The number of SSH certificates to return."
  },
  LIST_SSH_CERTIFICATE_TEMPLATES: {
    projectId: "The ID of the project to list SSH certificate templates for."
  },
  LIST_CAS: {
    slug: "The slug of the project to list CAs for.",
    status: "The status of the CA to filter by.",
    friendlyName: "The friendly name of the CA to filter by.",
    commonName: "The common name of the CA to filter by.",
    offset: "The offset to start from. If you enter 10, it will start from the 10th CA.",
    limit: "The number of CAs to return."
  },
  LIST_CERTIFICATES: {
    slug: "The slug of the project to list certificates for.",
    friendlyName: "The friendly name of the certificate to filter by.",
    commonName: "The common name of the certificate to filter by.",
    offset: "The offset to start from. If you enter 10, it will start from the 10th certificate.",
    limit: "The number of certificates to return."
  }
} as const;

export const PROJECT_USERS = {
  INVITE_MEMBER: {
    projectId: "The ID of the project to invite the member to.",
    emails: "A list of organization member emails to invite to the project.",
    usernames: "A list of usernames to invite to the project.",
    roleSlugs:
      "A list of role slugs to assign to the newly created project membership. If nothing is provided, it will default to the Member role."
  },
  REMOVE_MEMBER: {
    projectId: "The ID of the project to remove the member from.",
    emails: "A list of organization member emails to remove from the project.",
    usernames: "A list of usernames to remove from the project."
  },
  GET_USER_MEMBERSHIPS: {
    workspaceId: "The ID of the project to get memberships from."
  },
  GET_USER_MEMBERSHIP: {
    workspaceId: "The ID of the project to get memberships from.",
    membershipId: "The ID of the user's project membership.",
    username: "The username to get project membership of. Email is the default username."
  },
  UPDATE_USER_MEMBERSHIP: {
    workspaceId: "The ID of the project to update the membership for.",
    membershipId: "The ID of the membership to update.",
    roles: "A list of roles to update the membership to."
  }
};

export const PROJECT_IDENTITIES = {
  LIST_IDENTITY_MEMBERSHIPS: {
    projectId: "The ID of the project to get identity memberships from.",
    offset: "The offset to start from. If you enter 10, it will start from the 10th identity membership.",
    limit: "The number of identity memberships to return.",
    orderBy: "The column to order identity memberships by.",
    orderDirection: "The direction identity memberships will be sorted in.",
    search: "The text string that identity membership names will be filtered by."
  },
  GET_IDENTITY_MEMBERSHIP_BY_ID: {
    identityId: "The ID of the identity to get the membership for.",
    projectId: "The ID of the project to get the identity membership for."
  },
  UPDATE_IDENTITY_MEMBERSHIP: {
    projectId: "The ID of the project to update the identity membership for.",
    identityId: "The ID of the identity to update the membership for.",
    roles: {
      description: "A list of role slugs to assign to the identity project membership.",
      role: "The role slug to assign to the newly created identity project membership.",
      isTemporary:
        "Whether the assigned role is temporary. If isTemporary is set true, must provide temporaryMode, temporaryRange and temporaryAccessStartTime.",
      temporaryMode: "Type of temporary expiry.",
      temporaryRange: "Expiry time for temporary access. In relative mode it could be 1s, 2m ,3h, etc.",
      temporaryAccessStartTime: "Time to which the temporary access starts."
    }
  },
  DELETE_IDENTITY_MEMBERSHIP: {
    projectId: "The ID of the project to delete the identity membership from.",
    identityId: "The ID of the identity to delete the membership from."
  },
  CREATE_IDENTITY_MEMBERSHIP: {
    projectId: "The ID of the project to create the identity membership from.",
    identityId: "The ID of the identity to create the membership from.",
    role: "The role slug to assign to the newly created identity project membership.",
    roles: {
      description: "A list of role slugs to assign to the newly created identity project membership.",
      role: "The role slug to assign to the newly created identity project membership.",
      isTemporary:
        "Whether the assigned role is temporary. If isTemporary is set true, must provide temporaryMode, temporaryRange and temporaryAccessStartTime.",
      temporaryMode: "Type of temporary expiry.",
      temporaryRange: "Expiry time for temporary access. In relative mode it could be 1s, 2m, 3h, etc.",
      temporaryAccessStartTime: "Time to which the temporary access starts."
    }
  }
};

export const ENVIRONMENTS = {
  CREATE: {
    workspaceId: "The ID of the project to create the environment in.",
    name: "The name of the environment to create.",
    slug: "The slug of the environment to create.",
    position: "The position of the environment. The lowest number will be displayed as the first environment."
  },
  UPDATE: {
    workspaceId: "The ID of the project to update the environment in.",
    id: "The ID of the environment to update.",
    name: "The new name of the environment.",
    slug: "The new slug of the environment.",
    position: "The new position of the environment. The lowest number will be displayed as the first environment."
  },
  DELETE: {
    workspaceId: "The ID of the project to delete the environment from.",
    id: "The ID of the environment to delete."
  },
  GET: {
    workspaceId: "The ID of the project the environment belongs to.",
    id: "The ID of the environment to fetch."
  }
} as const;

export const FOLDERS = {
  LIST: {
    workspaceId: "The ID of the project to list folders from.",
    environment: "The slug of the environment to list folders from.",
    path: "The path to list folders from.",
    directory: "The directory to list folders from. (Deprecated in favor of path)",
    recursive: "Whether or not to fetch all folders from the specified base path, and all of its subdirectories.",
    lastSecretModified:
      "The timestamp used to filter folders with secrets modified after the specified date. The format for this timestamp is ISO 8601 (e.g. 2025-04-01T09:41:45-04:00)"
  },
  GET_BY_ID: {
    folderId: "The ID of the folder to get details."
  },
  CREATE: {
    workspaceId: "The ID of the project to create the folder in.",
    environment: "The slug of the environment to create the folder in.",
    name: "The name of the folder to create.",
    path: "The path of the folder to create.",
    directory: "The directory of the folder to create. (Deprecated in favor of path)",
    description: "An optional description label for the folder."
  },
  UPDATE: {
    folderId: "The ID of the folder to update.",
    environment: "The slug of the environment where the folder is located.",
    name: "The new name of the folder.",
    path: "The path of the folder to update.",
    directory: "The new directory of the folder to update. (Deprecated in favor of path)",
    projectSlug: "The slug of the project where the folder is located.",
    workspaceId: "The ID of the project where the folder is located.",
    description: "An optional description label for the folder."
  },
  DELETE: {
    folderIdOrName: "The ID or name of the folder to delete.",
    workspaceId: "The ID of the project to delete the folder from.",
    environment: "The slug of the environment where the folder is located.",
    directory: "The directory of the folder to delete. (Deprecated in favor of path)",
    path: "The path of the folder to delete."
  }
} as const;

export const SECRETS = {
  ATTACH_TAGS: {
    secretName: "The name of the secret to attach tags to.",
    secretPath: "The path of the secret to attach tags to.",
    type: "The type of the secret to attach tags to. (shared/personal)",
    environment: "The slug of the environment where the secret is located",
    viewSecretValue: "Whether or not to retrieve the secret value.",
    projectSlug: "The slug of the project where the secret is located.",
    tagSlugs: "An array of existing tag slugs to attach to the secret."
  },
  DETACH_TAGS: {
    secretName: "The name of the secret to detach tags from.",
    secretPath: "The path of the secret to detach tags from.",
    type: "The type of the secret to attach tags to. (shared/personal)",
    environment: "The slug of the environment where the secret is located.",
    projectSlug: "The slug of the project where the secret is located.",
    tagSlugs: "An array of existing tag slugs to detach from the secret."
  }
} as const;

export const RAW_SECRETS = {
  LIST: {
    expand: "Whether or not to expand secret references.",
    recursive:
      "Whether or not to fetch all secrets from the specified base path, and all of its subdirectories. Note, the max depth is 20 deep.",
    workspaceId: "The ID of the project to list secrets from.",
    workspaceSlug:
      "The slug of the project to list secrets from. This parameter is only applicable by machine identities.",
    environment: "The slug of the environment to list secrets from.",
    secretPath: "The secret path to list secrets from.",
    viewSecretValue: "Whether or not to retrieve the secret value.",
    includeImports: "Weather to include imported secrets or not.",
    tagSlugs: "The comma separated tag slugs to filter secrets.",
    metadataFilter:
      "The secret metadata key-value pairs to filter secrets by. When querying for multiple metadata pairs, the query is treated as an AND operation. Secret metadata format is key=value1,value=value2|key=value3,value=value4."
  },
  CREATE: {
    secretName: "The name of the secret to create.",
    projectSlug: "The slug of the project to create the secret in.",
    environment: "The slug of the environment to create the secret in.",
    secretComment: "Attach a comment to the secret.",
    secretPath: "The path to create the secret in.",
    secretValue: "The value of the secret to create.",
    skipMultilineEncoding: "Skip multiline encoding for the secret value.",
    type: "The type of the secret to create.",
    workspaceId: "The ID of the project to create the secret in.",
    tagIds: "The ID of the tags to be attached to the created secret.",
    secretReminderRepeatDays: "Interval for secret rotation notifications, measured in days.",
    secretReminderNote: "Note to be attached in notification email."
  },
  GET: {
    expand: "Whether or not to expand secret references.",
    secretName: "The name of the secret to get.",
    workspaceId: "The ID of the project to get the secret from.",
    workspaceSlug: "The slug of the project to get the secret from.",
    environment: "The slug of the environment to get the secret from.",
    secretPath: "The path of the secret to get.",
    version: "The version of the secret to get.",
    type: "The type of the secret to get.",
    viewSecretValue: "Whether or not to retrieve the secret value.",
    includeImports: "Weather to include imported secrets or not."
  },
  UPDATE: {
    secretName: "The name of the secret to update.",
    secretComment: "Update comment to the secret.",
    environment: "The slug of the environment where the secret is located.",
    mode: "Defines how the system should handle missing secrets during an update.",
    secretPath: "The default path for secrets to update or upsert, if not provided in the secret details.",
    secretValue: "The new value of the secret.",
    skipMultilineEncoding: "Skip multiline encoding for the secret value.",
    type: "The type of the secret to update.",
    projectSlug: "The slug of the project to update the secret in.",
    workspaceId: "The ID of the project to update the secret in.",
    tagIds: "The ID of the tags to be attached to the updated secret.",
    secretReminderRepeatDays: "Interval for secret rotation notifications, measured in days.",
    secretReminderNote: "Note to be attached in notification email.",
    newSecretName: "The new name for the secret."
  },
  DELETE: {
    secretName: "The name of the secret to delete.",
    environment: "The slug of the environment where the secret is located.",
    secretPath: "The path of the secret.",
    type: "The type of the secret to delete.",
    projectSlug: "The slug of the project to delete the secret in.",
    workspaceId: "The ID of the project where the secret is located."
  },
  GET_REFERENCE_TREE: {
    secretName: "The name of the secret to get the reference tree for.",
    workspaceId: "The ID of the project where the secret is located.",
    environment: "The slug of the environment where the the secret is located.",
    secretPath: "The folder path where the secret is located."
  },
  GET_ACCESS_LIST: {
    secretName: "The name of the secret to get the access list for.",
    workspaceId: "The ID of the project where the secret is located.",
    environment: "The slug of the environment where the the secret is located.",
    secretPath: "The folder path where the secret is located."
  }
} as const;

export const SECRET_IMPORTS = {
  LIST: {
    workspaceId: "The ID of the project to list secret imports from.",
    environment: "The slug of the environment to list secret imports from.",
    path: "The path to list secret imports from."
  },
  GET: {
    secretImportId: "The ID of the secret import to fetch."
  },
  CREATE: {
    environment: "The slug of the environment to import into.",
    path: "The path to import into.",
    workspaceId: "The ID of the project you are working in.",
    isReplication:
      "When true, secrets from the source will be automatically sent to the destination. If approval policies exist at the destination, the secrets will be sent as approval requests instead of being applied immediately.",
    import: {
      environment: "The slug of the environment to import from.",
      path: "The path to import from."
    }
  },
  UPDATE: {
    secretImportId: "The ID of the secret import to update.",
    environment: "The slug of the environment where the secret import is located.",
    import: {
      environment: "The new environment slug to import from.",
      path: "The new path to import from.",
      position: "The new position of the secret import. The lowest number will be displayed as the first import."
    },
    path: "The path of the secret import to update.",
    workspaceId: "The ID of the project where the secret import is located."
  },
  DELETE: {
    workspaceId: "The ID of the project to delete the secret import from.",
    secretImportId: "The ID of the secret import to delete.",
    environment: "The slug of the environment where the secret import is located.",
    path: "The path of the secret import to delete."
  }
} as const;

export const DASHBOARD = {
  SECRET_OVERVIEW_LIST: {
    projectId: "The ID of the project to list secrets/folders from.",
    environments:
      "The slugs of the environments to list secrets/folders from (comma separated, ie 'environments=dev,staging,prod').",
    secretPath: "The secret path to list secrets/folders from.",
    offset: "The offset to start from. If you enter 10, it will start from the 10th secret/folder.",
    limit: "The number of secrets/folders to return.",
    orderBy: "The column to order secrets/folders by.",
    orderDirection: "The direction to order secrets/folders in.",
    search: "The text string to filter secret keys and folder names by.",
    includeSecrets: "Whether to include project secrets in the response.",
    includeFolders: "Whether to include project folders in the response.",
    includeDynamicSecrets: "Whether to include dynamic project secrets in the response.",
    includeImports: "Whether to include project secret imports in the response.",
    includeSecretRotations: "Whether to include project secret rotations in the response."
  },
  SECRET_DETAILS_LIST: {
    projectId: "The ID of the project to list secrets/folders from.",
    environment: "The slug of the environment to list secrets/folders from.",
    secretPath: "The secret path to list secrets/folders from.",
    offset: "The offset to start from. If you enter 10, it will start from the 10th secret/folder.",
    limit: "The number of secrets/folders to return.",
    orderBy: "The column to order secrets/folders by.",
    orderDirection: "The direction to order secrets/folders in.",
    search: "The text string to filter secret keys and folder names by.",
    tags: "The tags to filter secrets by (comma separated, ie 'tags=billing,engineering').",
    includeSecrets: "Whether to include project secrets in the response.",
    includeFolders: "Whether to include project folders in the response.",
    includeImports: "Whether to include project secret imports in the response.",
    includeDynamicSecrets: "Whether to include dynamic project secrets in the response.",
    includeSecretRotations: "Whether to include secret rotations in the response."
  }
} as const;

export const AUDIT_LOGS = {
  EXPORT: {
    projectId:
      "Optionally filter logs by project ID. If not provided, logs from the entire organization will be returned.",
    environment:
      "The environment to filter logs by. If not provided, logs from all environments will be returned. Note that the projectId parameter must also be provided.",
    eventType: "The type of the event to export.",
    secretPath:
      "The path of the secret to query audit logs for. Note that the projectId parameter must also be provided.",
    secretKey:
      "The key of the secret to query audit logs for. Note that the projectId parameter must also be provided.",
    userAgentType: "Choose which consuming application to export audit logs for.",
    eventMetadata:
      "Filter by event metadata key-value pairs. Formatted as `key1=value1,key2=value2`, with comma-separation.",
    startDate: "The date to start the export from.",
    endDate: "The date to end the export at.",
    offset: "The offset to start from. If you enter 10, it will start from the 10th audit log.",
    limit: "The number of audit logs to return.",
    actor: "The actor to filter the audit logs by."
  }
} as const;

export const DYNAMIC_SECRETS = {
  LIST: {
    projectSlug: "The slug of the project to create dynamic secret in.",
    environmentSlug: "The slug of the environment to list folders from.",
    path: "The path to list folders from."
  },
  LIST_LEAES_BY_NAME: {
    projectSlug: "The slug of the project to create dynamic secret in.",
    environmentSlug: "The slug of the environment to list folders from.",
    path: "The path to list folders from.",
    name: "The name of the dynamic secret."
  },
  GET_BY_NAME: {
    projectSlug: "The slug of the project to create dynamic secret in.",
    environmentSlug: "The slug of the environment to list folders from.",
    path: "The path to list folders from.",
    name: "The name of the dynamic secret."
  },
  CREATE: {
    projectSlug: "The slug of the project to create dynamic secret in.",
    environmentSlug: "The slug of the environment to create the dynamic secret in.",
    path: "The path to create the dynamic secret in.",
    name: "The name of the dynamic secret.",
    provider: "The type of dynamic secret.",
    defaultTTL: "The default TTL that will be applied for all the leases.",
    maxTTL: "The maximum limit a TTL can be leases or renewed."
  },
  UPDATE: {
    projectSlug: "The slug of the project to update dynamic secret in.",
    environmentSlug: "The slug of the environment to update the dynamic secret in.",
    path: "The path to update the dynamic secret in.",
    name: "The name of the dynamic secret.",
    inputs: "The new partial values for the configured provider of the dynamic secret",
    defaultTTL: "The default TTL that will be applied for all the leases.",
    maxTTL: "The maximum limit a TTL can be leases or renewed.",
    newName: "The new name for the dynamic secret."
  },
  DELETE: {
    projectSlug: "The slug of the project to delete dynamic secret in.",
    environmentSlug: "The slug of the environment to delete the dynamic secret in.",
    path: "The path to delete the dynamic secret in.",
    name: "The name of the dynamic secret.",
    isForced:
      "A boolean flag to delete the the dynamic secret from Infisical without trying to remove it from external provider. Used when the dynamic secret got modified externally."
  }
} as const;

export const DYNAMIC_SECRET_LEASES = {
  GET_BY_LEASEID: {
    projectSlug: "The slug of the project to create dynamic secret in.",
    environmentSlug: "The slug of the environment to list folders from.",
    path: "The path to list folders from.",
    leaseId: "The ID of the dynamic secret lease."
  },
  CREATE: {
    projectSlug: "The slug of the project of the dynamic secret in.",
    environmentSlug: "The slug of the environment of the dynamic secret in.",
    path: "The path of the dynamic secret in.",
    dynamicSecretName: "The name of the dynamic secret.",
    ttl: "The lease lifetime TTL. If not provided the default TTL of dynamic secret will be used."
  },
  RENEW: {
    projectSlug: "The slug of the project of the dynamic secret in.",
    environmentSlug: "The slug of the environment of the dynamic secret in.",
    path: "The path of the dynamic secret in.",
    leaseId: "The ID of the dynamic secret lease.",
    ttl: "The renew TTL that gets added with current expiry (ensure it's below max TTL) for a total less than creation time + max TTL."
  },
  DELETE: {
    projectSlug: "The slug of the project of the dynamic secret in.",
    environmentSlug: "The slug of the environment of the dynamic secret in.",
    path: "The path of the dynamic secret in.",
    leaseId: "The ID of the dynamic secret lease.",
    isForced:
      "A boolean flag to delete the the dynamic secret from Infisical without trying to remove it from external provider. Used when the dynamic secret got modified externally."
  }
} as const;
export const SECRET_TAGS = {
  LIST: {
    projectId: "The ID of the project to list tags from."
  },
  GET_TAG_BY_ID: {
    projectId: "The ID of the project to get tags from.",
    tagId: "The ID of the tag to get details."
  },
  GET_TAG_BY_SLUG: {
    projectId: "The ID of the project to get tags from.",
    tagSlug: "The slug of the tag to get details."
  },
  CREATE: {
    projectId: "The ID of the project to create the tag in.",
    name: "The name of the tag to create.",
    slug: "The slug of the tag to create.",
    color: "The color of the tag to create."
  },
  UPDATE: {
    projectId: "The ID of the project to update the tag in.",
    tagId: "The ID of the tag to get details.",
    name: "The name of the tag to update.",
    slug: "The slug of the tag to update.",
    color: "The color of the tag to update."
  },
  DELETE: {
    tagId: "The ID of the tag to delete.",
    projectId: "The ID of the project to delete the tag from."
  }
} as const;

export const IDENTITY_ADDITIONAL_PRIVILEGE = {
  CREATE: {
    projectSlug: "The slug of the project of the identity in.",
    identityId: "The ID of the identity to create.",
    slug: "The slug of the privilege to create.",
    permissions: `@deprecated - use privilegePermission
The permission object for the privilege.
- Read secrets
\`\`\`
{ "permissions": [{"action": "read", "subject": "secrets"]}
\`\`\`
- Read and Write secrets
\`\`\`
{ "permissions": [{"action": "read", "subject": "secrets"], {"action": "write", "subject": "secrets"]}
\`\`\`
- Read secrets scoped to an environment and secret path
\`\`\`
- { "permissions": [{"action": "read", "subject": "secrets", "conditions": { "environment": "dev", "secretPath": { "$glob": "/" } }}] }
\`\`\`
`,
    privilegePermission: "The permission object for the privilege.",
    isPackPermission: "Whether the server should pack(compact) the permission object.",
    isTemporary: "Whether the privilege is temporary.",
    temporaryMode: "Type of temporary access given. Types: relative.",
    temporaryRange: "TTL for the temporary time. Eg: 1m, 1h, 1d.",
    temporaryAccessStartTime: "ISO time for which temporary access should begin."
  },
  UPDATE: {
    projectSlug: "The slug of the project of the identity in.",
    identityId: "The ID of the identity to update.",
    slug: "The slug of the privilege to update.",
    newSlug: "The new slug of the privilege to update.",
    permissions: `@deprecated - use privilegePermission
The permission object for the privilege.
- Read secrets
\`\`\`
{ "permissions": [{"action": "read", "subject": "secrets"]}
\`\`\`
- Read and Write secrets
\`\`\`
{ "permissions": [{"action": "read", "subject": "secrets"], {"action": "write", "subject": "secrets"]}
\`\`\`
- Read secrets scoped to an environment and secret path
\`\`\`
- { "permissions": [{"action": "read", "subject": "secrets", "conditions": { "environment": "dev", "secretPath": { "$glob": "/" } }}] }
\`\`\`
`,
    privilegePermission: "The permission object for the privilege.",
    isTemporary: "Whether the privilege is temporary.",
    temporaryMode: "Type of temporary access given. Types: relative.",
    temporaryRange: "TTL for the temporary time. Eg: 1m, 1h, 1d.",
    temporaryAccessStartTime: "ISO time for which temporary access should begin."
  },
  DELETE: {
    projectSlug: "The slug of the project of the identity in.",
    identityId: "The ID of the identity to delete.",
    slug: "The slug of the privilege to delete."
  },
  GET_BY_SLUG: {
    projectSlug: "The slug of the project of the identity in.",
    identityId: "The ID of the identity to list.",
    slug: "The slug of the privilege."
  },
  LIST: {
    projectSlug: "The slug of the project of the identity in.",
    identityId: "The ID of the identity to list.",
    unpacked: "Whether the system should send the permissions as unpacked."
  }
};

export const PROJECT_USER_ADDITIONAL_PRIVILEGE = {
  CREATE: {
    projectMembershipId: "Project membership ID of user.",
    slug: "The slug of the privilege to create.",
    permissions:
      "The permission object for the privilege. Refer https://casl.js.org/v6/en/guide/define-rules#the-shape-of-raw-rule to understand the shape.",
    isPackPermission: "Whether the server should pack (compact) the permission object.",
    isTemporary: "Whether the privilege is temporary.",
    temporaryMode: "Type of temporary access given. Types: relative.",
    temporaryRange: "TTL for the temporary time. Eg: 1m, 1h, 1d.",
    temporaryAccessStartTime: "ISO time for which temporary access should begin."
  },
  UPDATE: {
    privilegeId: "The ID of privilege object.",
    slug: "The slug of the privilege to create.",
    newSlug: "The new slug of the privilege to create.",
    permissions:
      "The permission object for the privilege. Refer https://casl.js.org/v6/en/guide/define-rules#the-shape-of-raw-rule to understand the shape.",
    isPackPermission: "Whether the server should pack (compact) the permission object.",
    isTemporary: "Whether the privilege is temporary.",
    temporaryMode: "Type of temporary access given. Types: relative.",
    temporaryRange: "TTL for the temporary time. Eg: 1m, 1h, 1d.",
    temporaryAccessStartTime: "ISO time for which temporary access should begin."
  },
  DELETE: {
    privilegeId: "The ID of privilege object."
  },
  GET_BY_PRIVILEGE_ID: {
    privilegeId: "The ID of privilege object."
  },
  LIST: {
    projectMembershipId: "Project membership ID of user."
  }
};

export const IDENTITY_ADDITIONAL_PRIVILEGE_V2 = {
  CREATE: {
    identityId: "The ID of the identity to create the privilege for.",
    projectId: "The ID of the project of the identity in.",
    slug: "The slug of the privilege to create.",
    permission: "The permission for the privilege.",
    isTemporary: "Whether the privilege is temporary or permanent.",
    temporaryMode: "Type of temporary access given. Types: relative.",
    temporaryRange: "The TTL for the temporary access given. Eg: 1m, 1h, 1d.",
    temporaryAccessStartTime: "The start time in ISO format when the temporary access should begin."
  },
  UPDATE: {
    id: "The ID of the identity privilege.",
    identityId: "The ID of the identity to update.",
    slug: "The slug of the privilege to update.",
    privilegePermission: "The permission for the privilege.",
    isTemporary: "Whether the privilege is temporary.",
    temporaryMode: "Type of temporary access given. Types: relative.",
    temporaryRange: "The TTL for the temporary access given. Eg: 1m, 1h, 1d.",
    temporaryAccessStartTime: "The start time in ISO format when the temporary access should begin."
  },
  DELETE: {
    id: "The ID of the identity privilege.",
    identityId: "The ID of the identity to delete.",
    slug: "The slug of the privilege to delete."
  },
  GET_BY_SLUG: {
    projectSlug: "The slug of the project of the identity in.",
    identityId: "The ID of the identity to list.",
    slug: "The slug of the privilege."
  },
  GET_BY_ID: {
    id: "The ID of the identity privilege."
  },
  LIST: {
    projectId: "The ID of the project that the identity is in.",
    identityId: "The ID of the identity to list."
  }
};

export const INTEGRATION_AUTH = {
  GET: {
    integrationAuthId: "The ID of integration authentication object."
  },
  DELETE: {
    integration: "The slug of the integration to be unauthorized.",
    projectId: "The ID of the project to delete the integration auth from."
  },
  DELETE_BY_ID: {
    integrationAuthId: "The ID of integration authentication object to delete."
  },
  UPDATE_BY_ID: {
    integrationAuthId: "The ID of integration authentication object to update."
  },
  CREATE_ACCESS_TOKEN: {
    workspaceId: "The ID of the project to create the integration auth for.",
    integration: "The slug of integration for the auth object.",
    accessId: "The unique authorized access ID of the external integration provider.",
    accessToken: "The unique authorized access token of the external integration provider.",
    awsAssumeIamRoleArn: "The AWS IAM Role to be assumed by Infisical.",
    url: "",
    namespace: "",
    refreshToken: "The refresh token for integration authorization."
  }
} as const;

export const INTEGRATION = {
  CREATE: {
    integrationAuthId: "The ID of the integration auth object to link with integration.",
    app: "The name of the external integration providers app entity that you want to sync secrets with. Used in Netlify, GitHub, Vercel integrations.",
    isActive: "Whether the integration should be active or disabled.",
    appId:
      "The ID of the external integration providers app entity that you want to sync secrets with. Used in Netlify, GitHub, Vercel integrations.",
    secretPath: "The path of the secrets to sync secrets from.",
    sourceEnvironment: "The environment to sync secret from.",
    targetEnvironment:
      "The target environment of the integration provider. Used in cloudflare pages, TeamCity, Gitlab integrations.",
    targetEnvironmentId:
      "The target environment ID of the integration provider. Used in cloudflare pages, teamcity, gitlab integrations.",
    targetService:
      "The service based grouping identifier of the external provider. Used in Terraform cloud, Checkly, Railway and NorthFlank.",
    targetServiceId:
      "The service based grouping identifier ID of the external provider. Used in Terraform cloud, Checkly, Railway and NorthFlank.",
    owner: "External integration providers service entity owner. Used in Github.",
    url: "The self-hosted URL of the platform to integrate with.",
    path: "Path to save the synced secrets. Used by Gitlab, AWS Parameter Store, Vault.",
    region: "AWS region to sync secrets to.",
    scope: "Scope of the provider. Used by Github, Qovery.",
    metadata: {
      secretPrefix: "The prefix for the saved secret. Used by GCP.",
      secretSuffix: "The suffix for the saved secret. Used by GCP.",
      initialSyncBehavoir: "Type of syncing behavoir with the integration.",
      mappingBehavior: "The mapping behavior of the integration.",
      shouldAutoRedeploy: "Used by Render to trigger auto deploy.",
      secretGCPLabel: "The label for GCP secrets.",
      secretAWSTag: "The tags for AWS secrets.",
      azureLabel: "Define which label to assign to secrets created in Azure App Configuration.",
      githubVisibility:
        "Define where the secrets from the Github Integration should be visible. Option 'selected' lets you directly define which repositories to sync secrets to.",
      githubVisibilityRepoIds:
        "The repository IDs to sync secrets to when using the Github Integration. Only applicable when using Organization scope, and visibility is set to 'selected'.",
      kmsKeyId: "The ID of the encryption key from AWS KMS.",
      shouldDisableDelete: "The flag to disable deletion of secrets in AWS Parameter Store.",
      shouldMaskSecrets: "Specifies if the secrets synced from Infisical to Gitlab should be marked as 'Masked'.",
      shouldProtectSecrets: "Specifies if the secrets synced from Infisical to Gitlab should be marked as 'Protected'.",
      shouldEnableDelete: "The flag to enable deletion of secrets.",
      octopusDeployScopeValues: "Specifies the scope values to set on synced secrets to Octopus Deploy.",
      metadataSyncMode: "The mode for syncing metadata to external system"
    }
  },
  UPDATE: {
    integrationId: "The ID of the integration object.",
    region: "AWS region to sync secrets to.",
    app: "The name of the external integration providers app entity that you want to sync secrets with. Used in Netlify, GitHub, Vercel integrations.",
    appId:
      "The ID of the external integration providers app entity that you want to sync secrets with. Used in Netlify, GitHub, Vercel integrations.",
    isActive: "Whether the integration should be active or disabled.",
    secretPath: "The path of the secrets to sync secrets from.",
    path: "Path to save the synced secrets. Used by Gitlab, AWS Parameter Store, Vault.",
    owner: "External integration providers service entity owner. Used in Github.",
    targetEnvironment:
      "The target environment of the integration provider. Used in cloudflare pages, TeamCity, Gitlab integrations.",
    environment: "The environment to sync secrets from."
  },
  DELETE: {
    integrationId: "The ID of the integration object."
  },
  SYNC: {
    integrationId: "The ID of the integration object to manually sync."
  }
};

export const AUDIT_LOG_STREAMS = {
  CREATE: {
    url: "The HTTP URL to push logs to.",
    headers: {
      desc: "The HTTP headers attached for the external provider requests.",
      key: "The HTTP header key name.",
      value: "The HTTP header value."
    }
  },
  UPDATE: {
    id: "The ID of the audit log stream to update.",
    url: "The HTTP URL to push logs to.",
    headers: {
      desc: "The HTTP headers attached for the external provider requests.",
      key: "The HTTP header key name.",
      value: "The HTTP header value."
    }
  },
  DELETE: {
    id: "The ID of the audit log stream to delete."
  },
  GET_BY_ID: {
    id: "The ID of the audit log stream to get details."
  }
};

export const SSH_CERTIFICATE_AUTHORITIES = {
  CREATE: {
    projectId: "The ID of the project to create the SSH CA in.",
    friendlyName: "A friendly name for the SSH CA.",
    keyAlgorithm:
      "The type of public key algorithm and size, in bits, of the key pair for the SSH CA; required if keySource is internal.",
    publicKey: "The public key for the SSH CA key pair; required if keySource is external.",
    privateKey: "The private key for the SSH CA key pair; required if keySource is external.",
    keySource: "The source of the SSH CA key pair. This can be one of internal or external."
  },
  GET: {
    sshCaId: "The ID of the SSH CA to get."
  },
  GET_PUBLIC_KEY: {
    sshCaId: "The ID of the SSH CA to get the public key for."
  },
  UPDATE: {
    sshCaId: "The ID of the SSH CA to update.",
    friendlyName: "A friendly name for the SSH CA to update to.",
    status: "The status of the SSH CA to update to. This can be one of active or disabled."
  },
  DELETE: {
    sshCaId: "The ID of the SSH CA to delete."
  },
  GET_CERTIFICATE_TEMPLATES: {
    sshCaId: "The ID of the SSH CA to get the certificate templates for."
  },
  SIGN_SSH_KEY: {
    certificateTemplateId: "The ID of the SSH certificate template to sign the SSH public key with.",
    publicKey: "The SSH public key to sign.",
    certType: "The type of certificate to issue. This can be one of user or host.",
    principals: "The list of principals (usernames, hostnames) to include in the certificate.",
    ttl: "The time to live for the certificate such as 1m, 1h, 1d, ... If not specified, the default TTL for the template will be used.",
    keyId: "The key ID to include in the certificate. If not specified, a default key ID will be generated.",
    serialNumber: "The serial number of the issued SSH certificate.",
    signedKey: "The SSH certificate or signed SSH public key."
  },
  ISSUE_SSH_CREDENTIALS: {
    certificateTemplateId: "The ID of the SSH certificate template to issue the SSH credentials with.",
    keyAlgorithm: "The type of public key algorithm and size, in bits, of the key pair for the SSH CA.",
    certType: "The type of certificate to issue. This can be one of user or host.",
    principals: "The list of principals (usernames, hostnames) to include in the certificate.",
    ttl: "The time to live for the certificate such as 1m, 1h, 1d, ... If not specified, the default TTL for the template will be used.",
    keyId: "The key ID to include in the certificate. If not specified, a default key ID will be generated.",
    serialNumber: "The serial number of the issued SSH certificate.",
    signedKey: "The SSH certificate or signed SSH public key.",
    privateKey: "The private key corresponding to the issued SSH certificate.",
    publicKey: "The public key of the issued SSH certificate."
  }
};

export const SSH_CERTIFICATE_TEMPLATES = {
  GET: {
    certificateTemplateId: "The ID of the SSH certificate template to get."
  },
  CREATE: {
    sshCaId: "The ID of the SSH CA to associate the certificate template with.",
    name: "The name of the certificate template.",
    ttl: "The default time to live for issued certificates such as 1m, 1h, 1d, 1y, ...",
    maxTTL: "The maximum time to live for issued certificates such as 1m, 1h, 1d, 1y, ...",
    allowedUsers: "The list of allowed users for certificates issued under this template.",
    allowedHosts: "The list of allowed hosts for certificates issued under this template.",
    allowUserCertificates: "Whether or not to allow user certificates to be issued under this template.",
    allowHostCertificates: "Whether or not to allow host certificates to be issued under this template.",
    allowCustomKeyIds: "Whether or not to allow custom key IDs for certificates issued under this template."
  },
  UPDATE: {
    certificateTemplateId: "The ID of the SSH certificate template to update.",
    name: "The name of the certificate template.",
    ttl: "The default time to live for issued certificates such as 1m, 1h, 1d, 1y, ...",
    maxTTL: "The maximum time to live for issued certificates such as 1m, 1h, 1d, 1y, ...",
    allowedUsers: "The list of allowed users for certificates issued under this template.",
    allowedHosts: "The list of allowed hosts for certificates issued under this template.",
    allowUserCertificates: "Whether or not to allow user certificates to be issued under this template.",
    allowHostCertificates: "Whether or not to allow host certificates to be issued under this template.",
    allowCustomKeyIds: "Whether or not to allow custom key IDs for certificates issued under this template."
  },
  DELETE: {
    certificateTemplateId: "The ID of the SSH certificate template to delete."
  }
};

export const SSH_HOSTS = {
  GET: {
    sshHostId: "The ID of the SSH host to get."
  },
  CREATE: {
    projectId: "The ID of the project to create the SSH host in.",
    hostname: "The hostname of the SSH host.",
    userCertTtl: "The time to live for user certificates issued under this host.",
    hostCertTtl: "The time to live for host certificates issued under this host.",
    loginUser: "A login user on the remote machine (e.g. 'ec2-user', 'deploy', 'admin')",
    allowedPrincipals: "A list of allowed principals that can log in as the login user.",
    loginMappings:
      "A list of login mappings for the SSH host. Each login mapping contains a login user and a list of corresponding allowed principals being usernames of users in the Infisical SSH project.",
    userSshCaId:
      "The ID of the SSH CA to use for user certificates. If not specified, the default user SSH CA will be used if it exists.",
    hostSshCaId:
      "The ID of the SSH CA to use for host certificates. If not specified, the default host SSH CA will be used if it exists."
  },
  UPDATE: {
    sshHostId: "The ID of the SSH host to update.",
    hostname: "The hostname of the SSH host to update to.",
    userCertTtl: "The time to live for user certificates issued under this host to update to.",
    hostCertTtl: "The time to live for host certificates issued under this host to update to.",
    loginUser: "A login user on the remote machine (e.g. 'ec2-user', 'deploy', 'admin')",
    allowedPrincipals: "A list of allowed principals that can log in as the login user.",
    loginMappings:
      "A list of login mappings for the SSH host. Each login mapping contains a login user and a list of corresponding allowed principals being usernames of users in the Infisical SSH project."
  },
  DELETE: {
    sshHostId: "The ID of the SSH host to delete."
  },
  ISSUE_SSH_CREDENTIALS: {
    sshHostId: "The ID of the SSH host to issue the SSH credentials for.",
    loginUser: "The login user to issue the SSH credentials for.",
    keyAlgorithm: "The type of public key algorithm and size, in bits, of the key pair for the SSH host.",
    serialNumber: "The serial number of the issued SSH certificate.",
    signedKey: "The SSH certificate or signed SSH public key.",
    privateKey: "The private key corresponding to the issued SSH certificate.",
    publicKey: "The public key of the issued SSH certificate."
  },
  ISSUE_HOST_CERT: {
    sshHostId: "The ID of the SSH host to issue the SSH certificate for.",
    publicKey: "The SSH public key to issue the SSH certificate for.",
    serialNumber: "The serial number of the issued SSH certificate.",
    signedKey: "The SSH certificate or signed SSH public key."
  },
  GET_USER_CA_PUBLIC_KEY: {
    sshHostId: "The ID of the SSH host to get the user SSH CA public key for.",
    publicKey: "The public key of the user SSH CA linked to the SSH host."
  },
  GET_HOST_CA_PUBLIC_KEY: {
    sshHostId: "The ID of the SSH host to get the host SSH CA public key for.",
    publicKey: "The public key of the host SSH CA linked to the SSH host."
  }
};

export const CERTIFICATE_AUTHORITIES = {
  CREATE: {
    projectSlug: "Slug of the project to create the CA in.",
    type: "The type of CA to create.",
    friendlyName: "A friendly name for the CA.",
    organization: "The organization (O) for the CA.",
    ou: "The organization unit (OU) for the CA.",
    country: "The country name (C) for the CA.",
    province: "The state of province name for the CA.",
    locality: "The locality name for the CA.",
    commonName: "The common name (CN) for the CA.",
    notBefore: "The date and time when the CA becomes valid in YYYY-MM-DDTHH:mm:ss.sssZ format.",
    notAfter: "The date and time when the CA expires in YYYY-MM-DDTHH:mm:ss.sssZ format.",
    maxPathLength:
      "The maximum number of intermediate CAs that may follow this CA in the certificate / CA chain. A maxPathLength of -1 implies no path limit on the chain.",
    keyAlgorithm:
      "The type of public key algorithm and size, in bits, of the key pair for the CA; when you create an intermediate CA, you must use a key algorithm supported by the parent CA.",
    requireTemplateForIssuance:
      "Whether or not certificates for this CA can only be issued through certificate templates."
  },
  GET: {
    caId: "The ID of the CA to get."
  },
  UPDATE: {
    caId: "The ID of the CA to update.",
    status: "The status of the CA to update to. This can be one of active or disabled.",
    requireTemplateForIssuance:
      "Whether or not certificates for this CA can only be issued through certificate templates."
  },
  DELETE: {
    caId: "The ID of the CA to delete."
  },
  GET_CSR: {
    caId: "The ID of the CA to generate CSR from.",
    csr: "The generated CSR from the CA."
  },
  RENEW_CA_CERT: {
    caId: "The ID of the CA to renew the CA certificate for.",
    type: "The type of behavior to use for the renewal operation. Currently Infisical is only able to renew a CA certificate with the same key pair.",
    notAfter: "The expiry date and time for the renewed CA certificate in YYYY-MM-DDTHH:mm:ss.sssZ format.",
    certificate: "The renewed CA certificate body.",
    certificateChain: "The certificate chain of the CA.",
    serialNumber: "The serial number of the renewed CA certificate."
  },
  GET_CERT: {
    caId: "The ID of the CA to get the certificate body and certificate chain from.",
    certificate: "The certificate body of the CA.",
    certificateChain: "The certificate chain of the CA.",
    serialNumber: "The serial number of the CA certificate."
  },
  GET_CERT_BY_ID: {
    caId: "The ID of the CA to get the CA certificate from.",
    caCertId: "The ID of the CA certificate to get."
  },
  GET_CA_CERTS: {
    caId: "The ID of the CA to get the CA certificates for.",
    certificate: "The certificate body of the CA certificate.",
    certificateChain: "The certificate chain of the CA certificate.",
    serialNumber: "The serial number of the CA certificate.",
    version: "The version of the CA certificate. The version is incremented for each CA renewal operation."
  },
  SIGN_INTERMEDIATE: {
    caId: "The ID of the CA to sign the intermediate certificate with.",
    csr: "The pem-encoded CSR to sign with the CA.",
    notBefore: "The date and time when the intermediate CA becomes valid in YYYY-MM-DDTHH:mm:ss.sssZ format.",
    notAfter: "The date and time when the intermediate CA expires in YYYY-MM-DDTHH:mm:ss.sssZ format.",
    maxPathLength:
      "The maximum number of intermediate CAs that may follow this CA in the certificate / CA chain. A maxPathLength of -1 implies no path limit on the chain.",
    certificate: "The signed intermediate certificate.",
    certificateChain: "The certificate chain of the intermediate certificate.",
    issuingCaCertificate: "The certificate of the issuing CA.",
    serialNumber: "The serial number of the intermediate certificate."
  },
  IMPORT_CERT: {
    caId: "The ID of the CA to import the certificate for.",
    certificate: "The certificate body to import.",
    certificateChain: "The certificate chain to import."
  },
  ISSUE_CERT: {
    caId: "The ID of the CA to issue the certificate from.",
    certificateTemplateId: "The ID of the certificate template to issue the certificate from.",
    pkiCollectionId: "The ID of the PKI collection to add the certificate to.",
    friendlyName: "A friendly name for the certificate.",
    commonName: "The common name (CN) for the certificate.",
    altNames:
      "A comma-delimited list of Subject Alternative Names (SANs) for the certificate; these can be host names or email addresses.",
    ttl: "The time to live for the certificate such as 1m, 1h, 1d, 1y, ...",
    notBefore: "The date and time when the certificate becomes valid in YYYY-MM-DDTHH:mm:ss.sssZ format.",
    notAfter: "The date and time when the certificate expires in YYYY-MM-DDTHH:mm:ss.sssZ format.",
    certificate: "The issued certificate.",
    issuingCaCertificate: "The certificate of the issuing CA.",
    certificateChain: "The certificate chain of the issued certificate.",
    privateKey: "The private key of the issued certificate.",
    serialNumber: "The serial number of the issued certificate.",
    keyUsages: "The key usage extension of the certificate.",
    extendedKeyUsages: "The extended key usage extension of the certificate."
  },
  SIGN_CERT: {
    caId: "The ID of the CA to issue the certificate from.",
    pkiCollectionId: "The ID of the PKI collection to add the certificate to.",
    keyUsages: "The key usage extension of the certificate.",
    extendedKeyUsages: "The extended key usage extension of the certificate.",
    csr: "The pem-encoded CSR to sign with the CA to be used for certificate issuance.",
    friendlyName: "A friendly name for the certificate.",
    commonName: "The common name (CN) for the certificate.",
    altNames:
      "A comma-delimited list of Subject Alternative Names (SANs) for the certificate; these can be host names or email addresses.",
    ttl: "The time to live for the certificate such as 1m, 1h, 1d, 1y, ...",
    notBefore: "The date and time when the certificate becomes valid in YYYY-MM-DDTHH:mm:ss.sssZ format.",
    notAfter: "The date and time when the certificate expires in YYYY-MM-DDTHH:mm:ss.sssZ format.",
    certificate: "The issued certificate.",
    issuingCaCertificate: "The certificate of the issuing CA.",
    certificateChain: "The certificate chain of the issued certificate.",
    serialNumber: "The serial number of the issued certificate."
  },
  GET_CRLS: {
    caId: "The ID of the CA to get the certificate revocation lists (CRLs) for.",
    id: "The ID of certificate revocation list (CRL).",
    crl: "The certificate revocation list (CRL)."
  }
};

export const CERTIFICATES = {
  GET: {
    serialNumber: "The serial number of the certificate to get."
  },
  REVOKE: {
    serialNumber:
      "The serial number of the certificate to revoke. The revoked certificate will be added to the certificate revocation list (CRL) of the CA.",
    revocationReason: "The reason for revoking the certificate.",
    revokedAt: "The date and time when the certificate was revoked.",
    serialNumberRes: "The serial number of the revoked certificate."
  },
  DELETE: {
    serialNumber: "The serial number of the certificate to delete."
  },
  GET_CERT: {
    serialNumber: "The serial number of the certificate to get the certificate body and certificate chain for.",
    certificate: "The certificate body of the certificate.",
    certificateChain: "The certificate chain of the certificate.",
    serialNumberRes: "The serial number of the certificate."
  }
};

export const CERTIFICATE_TEMPLATES = {
  CREATE: {
    caId: "The ID of the certificate authority to associate the template with.",
    pkiCollectionId: "The ID of the PKI collection to bind to the template.",
    name: "The name of the template.",
    commonName: "The regular expression string to use for validating common names.",
    subjectAlternativeName: "The regular expression string to use for validating subject alternative names.",
    ttl: "The max TTL for the template.",
    keyUsages: "The key usage constraint or default value for when template is used during certificate issuance.",
    extendedKeyUsages:
      "The extended key usage constraint or default value for when template is used during certificate issuance."
  },
  GET: {
    certificateTemplateId: "The ID of the certificate template to get."
  },
  UPDATE: {
    certificateTemplateId: "The ID of the certificate template to update.",
    caId: "The ID of the certificate authority to update the association with the template.",
    pkiCollectionId: "The ID of the PKI collection to update the binding to the template.",
    name: "The updated name of the template.",
    commonName: "The updated regular expression string for validating common names.",
    subjectAlternativeName: "The updated regular expression string for validating subject alternative names.",
    ttl: "The updated max TTL for the template.",
    keyUsages:
      "The updated key usage constraint or default value for when template is used during certificate issuance.",
    extendedKeyUsages:
      "The updated extended key usage constraint or default value for when template is used during certificate issuance."
  },
  DELETE: {
    certificateTemplateId: "The ID of the certificate template to delete."
  }
};

export const CA_CRLS = {
  GET: {
    crlId: "The ID of the certificate revocation list (CRL) to get.",
    crl: "The certificate revocation list (CRL)."
  }
};

export const ALERTS = {
  CREATE: {
    projectId: "The ID of the project to create the alert in.",
    pkiCollectionId: "The ID of the PKI collection to bind to the alert.",
    name: "The name of the alert.",
    alertBeforeDays: "The number of days before the certificate expires to trigger the alert.",
    emails: "The email addresses to send the alert email to."
  },
  GET: {
    alertId: "The ID of the alert to get."
  },
  UPDATE: {
    alertId: "The ID of the alert to update.",
    name: "The name of the alert to update to.",
    alertBeforeDays: "The number of days before the certificate expires to trigger the alert to update to.",
    pkiCollectionId: "The ID of the PKI collection to bind to the alert to update to.",
    emails: "The email addresses to send the alert email to update to."
  },
  DELETE: {
    alertId: "The ID of the alert to delete."
  }
};

export const PKI_COLLECTIONS = {
  CREATE: {
    projectId: "The ID of the project to create the PKI collection in.",
    name: "The name of the PKI collection.",
    description: "A description for the PKI collection."
  },
  GET: {
    collectionId: "The ID of the PKI collection to get."
  },
  UPDATE: {
    collectionId: "The ID of the PKI collection to update.",
    name: "The name of the PKI collection to update to.",
    description: "The description for the PKI collection to update to."
  },
  DELETE: {
    collectionId: "The ID of the PKI collection to delete."
  },
  LIST_ITEMS: {
    collectionId: "The ID of the PKI collection to list items from.",
    type: "The type of the PKI collection item to list.",
    offset: "The offset to start from.",
    limit: "The number of items to return."
  },
  ADD_ITEM: {
    collectionId: "The ID of the PKI collection to add the item to.",
    type: "The type of the PKI collection item to add.",
    itemId: "The resource ID of the PKI collection item to add."
  },
  DELETE_ITEM: {
    collectionId: "The ID of the PKI collection to delete the item from.",
    collectionItemId: "The ID of the PKI collection item to delete.",
    type: "The type of the deleted PKI collection item.",
    itemId: "The resource ID of the deleted PKI collection item."
  }
};

export const PROJECT_ROLE = {
  CREATE: {
    projectSlug: "Slug of the project to create the role for.",
    projectId: "Id of the project to create the role for.",
    slug: "The slug of the role.",
    name: "The name of the role.",
    description: "The description for the role.",
    permissions: "The permissions assigned to the role."
  },
  UPDATE: {
    projectSlug: "The slug of the project to update the role for.",
    projectId: "The ID of the project to update the role for.",
    roleId: "The ID of the role to update",
    slug: "The slug of the role.",
    name: "The name of the role.",
    description: "The description for the role.",
    permissions: "The permissions assigned to the role."
  },
  DELETE: {
    projectSlug: "The slug of the project to delete this role for.",
    projectId: "The ID of the project to delete the role for.",
    roleId: "The ID of the role to update"
  },
  GET_ROLE_BY_SLUG: {
    projectSlug: "The slug of the project.",
    projectId: "The ID of the project.",
    roleSlug: "The slug of the role to get details."
  },
  LIST: {
    projectSlug: "The slug of the project to list the roles of.",
    projectId: "The ID of the project."
  }
};

export const KMS = {
  CREATE_KEY: {
    projectId: "The ID of the project to create the key in.",
    name: "The name of the key to be created. Must be slug-friendly.",
    description: "An optional description of the key.",
    encryptionAlgorithm: "The algorithm to use when performing cryptographic operations with the key.",
    type: "The type of key to be created, either encrypt-decrypt or sign-verify, based on your intended use for the key."
  },
  UPDATE_KEY: {
    keyId: "The ID of the key to be updated.",
    name: "The updated name of this key. Must be slug-friendly.",
    description: "The updated description of this key.",
    isDisabled: "The flag to enable or disable this key."
  },
  DELETE_KEY: {
    keyId: "The ID of the key to be deleted."
  },
  LIST_KEYS: {
    projectId: "The ID of the project to list keys from.",
    offset: "The offset to start from. If you enter 10, it will start from the 10th key.",
    limit: "The number of keys to return.",
    orderBy: "The column to order keys by.",
    orderDirection: "The direction to order keys in.",
    search: "The text string to filter key names by."
  },
  GET_KEY_BY_ID: {
    keyId: "The ID of the KMS key to retrieve."
  },
  GET_KEY_BY_NAME: {
    keyName: "The name of the KMS key to retrieve.",
    projectId: "The ID of the project the key belongs to."
  },
  ENCRYPT: {
    keyId: "The ID of the key to encrypt the data with.",
    plaintext: "The plaintext to be encrypted (base64 encoded)."
  },
  DECRYPT: {
    keyId: "The ID of the key to decrypt the data with.",
    ciphertext: "The ciphertext to be decrypted (base64 encoded)."
  },

  LIST_SIGNING_ALGORITHMS: {
    keyId: "The ID of the key to list the signing algorithms for. The key must be for signing and verifying."
  },

  GET_PUBLIC_KEY: {
    keyId: "The ID of the key to get the public key for. The key must be for signing and verifying."
  },

  SIGN: {
    keyId: "The ID of the key to sign the data with.",
    data: "The data in string format to be signed (base64 encoded).",
    isDigest:
      "Whether the data is already digested or not. Please be aware that if you are passing a digest the algorithm used to create the digest must match the signing algorithm used to sign the digest.",
    signingAlgorithm: "The algorithm to use when performing cryptographic operations with the key."
  },
  VERIFY: {
    keyId: "The ID of the key to verify the data with.",
    data: "The data in string format to be verified (base64 encoded). For data larger than 4096 bytes you must first create a digest of the data and then pass the digest in the data parameter.",
    signature: "The signature to be verified (base64 encoded).",
    isDigest: "Whether the data is already digested or not."
  }
};

export const ProjectTemplates = {
  CREATE: {
    name: "The name of the project template to be created. Must be slug-friendly.",
    description: "An optional description of the project template.",
    roles: "The roles to be created when the template is applied to a project.",
    environments: "The environments to be created when the template is applied to a project."
  },
  UPDATE: {
    templateId: "The ID of the project template to be updated.",
    name: "The updated name of the project template. Must be slug-friendly.",
    description: "The updated description of the project template.",
    roles: "The updated roles to be created when the template is applied to a project.",
    environments: "The updated environments to be created when the template is applied to a project."
  },
  DELETE: {
    templateId: "The ID of the project template to be deleted."
  }
};

export const AppConnections = {
  GET_BY_ID: (app: AppConnection) => ({
    connectionId: `The ID of the ${APP_CONNECTION_NAME_MAP[app]} Connection to retrieve.`
  }),
  GET_BY_NAME: (app: AppConnection) => ({
    connectionName: `The name of the ${APP_CONNECTION_NAME_MAP[app]} Connection to retrieve.`
  }),
  CREATE: (app: AppConnection) => {
    const appName = APP_CONNECTION_NAME_MAP[app];
    return {
      name: `The name of the ${appName} Connection to create. Must be slug-friendly.`,
      description: `An optional description for the ${appName} Connection.`,
      credentials: `The credentials used to connect with ${appName}.`,
      method: `The method used to authenticate with ${appName}.`,
      isPlatformManagedCredentials: `Whether or not the ${appName} Connection credentials should be managed by Infisical. Once enabled this cannot be reversed.`
    };
  },
  UPDATE: (app: AppConnection) => {
    const appName = APP_CONNECTION_NAME_MAP[app];
    return {
      connectionId: `The ID of the ${appName} Connection to be updated.`,
      name: `The updated name of the ${appName} Connection. Must be slug-friendly.`,
      description: `The updated description of the ${appName} Connection.`,
      credentials: `The credentials used to connect with ${appName}.`,
      method: `The method used to authenticate with ${appName}.`,
      isPlatformManagedCredentials: `Whether or not the ${appName} Connection credentials should be managed by Infisical. Once enabled this cannot be reversed.`
    };
  },
  DELETE: (app: AppConnection) => ({
    connectionId: `The ID of the ${APP_CONNECTION_NAME_MAP[app]} Connection to be deleted.`
  }),
  CREDENTIALS: {
    AUTH0_CONNECTION: {
      domain: "The domain of the Auth0 instance to connect to.",
      clientId: "Your Auth0 application's Client ID.",
      clientSecret: "Your Auth0 application's Client Secret.",
      audience: "The unique identifier of the target API you want to access."
    },
    SQL_CONNECTION: {
      host: "The hostname of the database server.",
      port: "The port number of the database.",
      database: "The name of the database to connect to.",
      username: "The username to connect to the database with.",
      password: "The password to connect to the database with.",
      sslEnabled: "Whether or not to use SSL when connecting to the database.",
      sslRejectUnauthorized: "Whether or not to reject unauthorized SSL certificates.",
      sslCertificate: "The SSL certificate to use for connection."
    },
    TERRAFORM_CLOUD: {
      apiToken: "The API token to use to connect with Terraform Cloud."
    },
    VERCEL: {
      apiToken: "The API token used to authenticate with Vercel."
    },
    CAMUNDA: {
      clientId: "The client ID used to authenticate with Camunda.",
      clientSecret: "The client secret used to authenticate with Camunda."
    }
  }
};

export const SecretSyncs = {
  LIST: (destination?: SecretSync) => ({
    projectId: `The ID of the project to list ${destination ? SECRET_SYNC_NAME_MAP[destination] : "Secret"} Syncs from.`
  }),
  GET_BY_ID: (destination: SecretSync) => ({
    syncId: `The ID of the ${SECRET_SYNC_NAME_MAP[destination]} Sync to retrieve.`
  }),
  GET_BY_NAME: (destination: SecretSync) => ({
    syncName: `The name of the ${SECRET_SYNC_NAME_MAP[destination]} Sync to retrieve.`,
    projectId: `The ID of the project the ${SECRET_SYNC_NAME_MAP[destination]} Sync is associated with.`
  }),
  CREATE: (destination: SecretSync) => {
    const destinationName = SECRET_SYNC_NAME_MAP[destination];
    return {
      name: `The name of the ${destinationName} Sync to create. Must be slug-friendly.`,
      description: `An optional description for the ${destinationName} Sync.`,
      projectId: "The ID of the project to create the sync in.",
      environment: `The slug of the project environment to sync secrets from.`,
      secretPath: `The folder path to sync secrets from.`,
      connectionId: `The ID of the ${
        APP_CONNECTION_NAME_MAP[SECRET_SYNC_CONNECTION_MAP[destination]]
      } Connection to use for syncing.`,
      isAutoSyncEnabled: `Whether secrets should be automatically synced when changes occur at the source location or not.`,
      syncOptions: "Optional parameters to modify how secrets are synced."
    };
  },
  UPDATE: (destination: SecretSync) => {
    const destinationName = SECRET_SYNC_NAME_MAP[destination];
    return {
      syncId: `The ID of the ${destinationName} Sync to be updated.`,
      connectionId: `The updated ID of the ${
        APP_CONNECTION_NAME_MAP[SECRET_SYNC_CONNECTION_MAP[destination]]
      } Connection to use for syncing.`,
      name: `The updated name of the ${destinationName} Sync. Must be slug-friendly.`,
      environment: `The updated slug of the project environment to sync secrets from.`,
      secretPath: `The updated folder path to sync secrets from.`,
      description: `The updated description of the ${destinationName} Sync.`,
      isAutoSyncEnabled: `Whether secrets should be automatically synced when changes occur at the source location or not.`,
      syncOptions: "Optional parameters to modify how secrets are synced."
    };
  },
  DELETE: (destination: SecretSync) => ({
    syncId: `The ID of the ${SECRET_SYNC_NAME_MAP[destination]} Sync to be deleted.`,
    removeSecrets: `Whether previously synced secrets should be removed prior to deletion.`
  }),
  SYNC_SECRETS: (destination: SecretSync) => ({
    syncId: `The ID of the ${SECRET_SYNC_NAME_MAP[destination]} Sync to trigger a sync for.`
  }),
  IMPORT_SECRETS: (destination: SecretSync) => ({
    syncId: `The ID of the ${SECRET_SYNC_NAME_MAP[destination]} Sync to trigger importing secrets for.`,
    importBehavior: `Specify whether Infisical should prioritize secret values from Infisical or ${SECRET_SYNC_NAME_MAP[destination]}.`
  }),
  REMOVE_SECRETS: (destination: SecretSync) => ({
    syncId: `The ID of the ${SECRET_SYNC_NAME_MAP[destination]} Sync to trigger removing secrets for.`
  }),
  SYNC_OPTIONS: (destination: SecretSync) => {
    const destinationName = SECRET_SYNC_NAME_MAP[destination];
    return {
      initialSyncBehavior: `Specify how Infisical should resolve the initial sync to the ${destinationName} destination.`,
      disableSecretDeletion: `Enable this flag to prevent removal of secrets from the ${destinationName} destination when syncing.`
    };
  },
  ADDITIONAL_SYNC_OPTIONS: {
    AWS_PARAMETER_STORE: {
      keyId: "The AWS KMS key ID or alias to use when encrypting parameters synced by Infisical.",
      tags: "Optional resource tags to add to parameters synced by Infisical.",
      syncSecretMetadataAsTags: `Whether Infisical secret metadata should be added as resource tags to parameters synced by Infisical.`
    },
    AWS_SECRETS_MANAGER: {
      keyId: "The AWS KMS key ID or alias to use when encrypting parameters synced by Infisical.",
      tags: "Optional tags to add to secrets synced by Infisical.",
      syncSecretMetadataAsTags: `Whether Infisical secret metadata should be added as tags to secrets synced by Infisical.`
    }
  },
  DESTINATION_CONFIG: {
    AWS_PARAMETER_STORE: {
      region: "The AWS region to sync secrets to.",
      path: "The Parameter Store path to sync secrets to."
    },
    AWS_SECRETS_MANAGER: {
      region: "The AWS region to sync secrets to.",
      mappingBehavior: "How secrets from Infisical should be mapped to AWS Secrets Manager; one-to-one or many-to-one.",
      secretName: "The secret name in AWS Secrets Manager to sync to when using mapping behavior many-to-one."
    },
    GITHUB: {
      scope: "The GitHub scope that secrets should be synced to",
      org: "The name of the GitHub organization.",
      owner: "The name of the GitHub account owner of the repository.",
      repo: "The name of the GitHub repository.",
      env: "The name of the GitHub environment."
    },
    AZURE_KEY_VAULT: {
      vaultBaseUrl: "The base URL of the Azure Key Vault to sync secrets to. Example: https://example.vault.azure.net/"
    },
    AZURE_APP_CONFIGURATION: {
      configurationUrl:
        "The URL of the Azure App Configuration to sync secrets to. Example: https://example.azconfig.io/",
      label: "An optional label to assign to secrets created in Azure App Configuration."
    },
    GCP: {
      scope: "The Google project scope that secrets should be synced to.",
      projectId: "The ID of the Google project secrets should be synced to."
    },
    DATABRICKS: {
      scope: "The Databricks secret scope that secrets should be synced to."
    },
    CAMUNDA: {
      scope: "The Camunda scope that secrets should be synced to.",
      clusterUUID: "The UUID of the Camunda cluster that secrets should be synced to."
    },
    HUMANITEC: {
      app: "The ID of the Humanitec app to sync secrets to.",
      org: "The ID of the Humanitec org to sync secrets to.",
      env: "The ID of the Humanitec environment to sync secrets to.",
      scope: "The Humanitec scope that secrets should be synced to."
    },
    TERRAFORM_CLOUD: {
      org: "The ID of the Terraform Cloud org to sync secrets to.",
      variableSetName: "The name of the Terraform Cloud Variable Set to sync secrets to.",
      variableSetId: "The ID of the Terraform Cloud Variable Set to sync secrets to.",
      workspaceName: "The name of the Terraform Cloud workspace to sync secrets to.",
      workspaceId: "The ID of the Terraform Cloud workspace to sync secrets to.",
      scope: "The Terraform Cloud scope that secrets should be synced to.",
      category: "The Terraform Cloud category that secrets should be synced to."
    },
    VERCEL: {
      app: "The ID of the Vercel app to sync secrets to.",
      appName: "The name of the Vercel app to sync secrets to.",
      env: "The ID of the Vercel environment to sync secrets to.",
      branch: "The branch to sync preview secrets to.",
      teamId: "The ID of the Vercel team to sync secrets to."
    }
  }
};

export const SecretRotations = {
  LIST: (type?: SecretRotation) => ({
    projectId: `The ID of the project to list ${type ? SECRET_ROTATION_NAME_MAP[type] : "Secret"} Rotations from.`
  }),
  GET_BY_ID: (type: SecretRotation) => ({
    rotationId: `The ID of the ${SECRET_ROTATION_NAME_MAP[type]} Rotation to retrieve.`
  }),
  GET_GENERATED_CREDENTIALS_BY_ID: (type: SecretRotation) => ({
    rotationId: `The ID of the ${SECRET_ROTATION_NAME_MAP[type]} Rotation to retrieve the generated credentials for.`
  }),
  GET_BY_NAME: (type: SecretRotation) => ({
    rotationName: `The name of the ${SECRET_ROTATION_NAME_MAP[type]} Rotation to retrieve.`,
    projectId: `The ID of the project the ${SECRET_ROTATION_NAME_MAP[type]} Rotation is located in.`,
    secretPath: `The secret path the ${SECRET_ROTATION_NAME_MAP[type]} Rotation is located at.`,
    environment: `The environment the ${SECRET_ROTATION_NAME_MAP[type]} Rotation is located in.`
  }),
  CREATE: (type: SecretRotation) => {
    const destinationName = SECRET_ROTATION_NAME_MAP[type];
    return {
      name: `The name of the ${destinationName} Rotation to create. Must be slug-friendly.`,
      description: `An optional description for the ${destinationName} Rotation.`,
      projectId: "The ID of the project to create the rotation in.",
      environment: `The slug of the project environment to create the rotation in.`,
      secretPath: `The secret path of the project to create the rotation in.`,
      connectionId: `The ID of the ${
        APP_CONNECTION_NAME_MAP[SECRET_ROTATION_CONNECTION_MAP[type]]
      } Connection to use for rotation.`,
      isAutoRotationEnabled: `Whether secrets should be automatically rotated when the specified rotation interval has elapsed.`,
      rotationInterval: `The interval, in days, to automatically rotate secrets.`,
      rotateAtUtc: `The hours and minutes rotation should occur at in UTC. Defaults to Midnight (00:00) UTC.`
    };
  },
  UPDATE: (type: SecretRotation) => {
    const typeName = SECRET_ROTATION_NAME_MAP[type];
    return {
      rotationId: `The ID of the ${typeName} Rotation to be updated.`,
      name: `The updated name of the ${typeName} Rotation. Must be slug-friendly.`,
      description: `The updated description of the ${typeName} Rotation.`,
      isAutoRotationEnabled: `Whether secrets should be automatically rotated when the specified rotation interval has elapsed.`,
      rotationInterval: `The updated interval, in days, to automatically rotate secrets.`,
      rotateAtUtc: `The updated hours and minutes rotation should occur at in UTC.`
    };
  },
  DELETE: (type: SecretRotation) => ({
    rotationId: `The ID of the ${SECRET_ROTATION_NAME_MAP[type]} Rotation to be deleted.`,
    deleteSecrets: `Whether the mapped secrets belonging to this rotation should be deleted.`,
    revokeGeneratedCredentials: `Whether the generated credentials associated with this rotation should be revoked.`
  }),
  ROTATE: (type: SecretRotation) => ({
    rotationId: `The ID of the ${SECRET_ROTATION_NAME_MAP[type]} Rotation to rotate generated credentials for.`
  }),
  PARAMETERS: {
    SQL_CREDENTIALS: {
      username1:
        "The username of the first login to rotate passwords for. This user must already exists in your database.",
      username2:
        "The username of the second login to rotate passwords for. This user must already exists in your database."
    },
    AUTH0_CLIENT_SECRET: {
      clientId: "The client ID of the Auth0 Application to rotate the client secret for."
    }
  },
  SECRETS_MAPPING: {
    SQL_CREDENTIALS: {
      username: "The name of the secret that the active username will be mapped to.",
      password: "The name of the secret that the generated password will be mapped to."
    },
    AUTH0_CLIENT_SECRET: {
      clientId: "The name of the secret that the client ID will be mapped to.",
      clientSecret: "The name of the secret that the rotated client secret will be mapped to."
    }
  }
};
