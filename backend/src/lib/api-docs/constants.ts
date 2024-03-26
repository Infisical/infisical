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
    identityId: "The ID of the identity to retrieve."
  },
  UPDATE: {
    identityId: "The ID of the identity to update.",
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
  REVOKE_CLIENT_SECRET: {
    identityId: "The ID of the identity to revoke the client secret from.",
    clientSecretId: "The ID of the client secret to revoke."
  },
  RENEW_ACCESS_TOKEN: {
    accessToken: "The access token to renew."
  }
} as const;

export const ORGANIZATIONS = {
  LIST_USER_MEMBERSHIPS: {
    organizationId: "The ID of the organization to get memberships from."
  },
  UPDATE_USER_MEMBERSHIP: {
    organizationId: "The ID of the organization to update the membership for.",
    membershipId: "The ID of the membership to update.",
    role: "The new role of the membership."
  },
  DELETE_USER_MEMBERSHIP: {
    organizationId: "The ID of the organization to delete the membership from.",
    membershipId: "The ID of the membership to delete."
  },
  LIST_IDENTITY_MEMBERSHIPS: {
    orgId: "The ID of the organization to get identity memberships from."
  },
  GET_PROJECTS: {
    organizationId: "The ID of the organization to get projects from."
  }
} as const;

export const PROJECTS = {
  CREATE: {
    organizationSlug: "The slug of the organization to create the project in.",
    projectName: "The name of the project to create.",
    slug: "An optional slug for the project."
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
    autoCapitalization: "Disable or enable auto-capitalization for the project."
  },
  INVITE_MEMBER: {
    projectId: "The ID of the project to invite the member to.",
    emails: "A list of organization member emails to invite to the project.",
    usernames: "A list of usernames to invite to the project."
  },
  REMOVE_MEMBER: {
    projectId: "The ID of the project to remove the member from.",
    emails: "A list of organization member emails to remove from the project.",
    usernames: "A list of usernames to remove from the project."
  },
  GET_USER_MEMBERSHIPS: {
    workspaceId: "The ID of the project to get memberships from."
  },
  UPDATE_USER_MEMBERSHIP: {
    workspaceId: "The ID of the project to update the membership for.",
    membershipId: "The ID of the membership to update.",
    roles: "A list of roles to update the membership to."
  },
  LIST_IDENTITY_MEMBERSHIPS: {
    projectId: "The ID of the project to get identity memberships from."
  },
  UPDATE_IDENTITY_MEMBERSHIP: {
    projectId: "The ID of the project to update the identity membership for.",
    identityId: "The ID of the identity to update the membership for.",
    roles: "A list of roles to update the membership to."
  },
  DELETE_IDENTITY_MEMBERSHIP: {
    projectId: "The ID of the project to delete the identity membership from.",
    identityId: "The ID of the identity to delete the membership from."
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
  }
} as const;

export const ENVIRONMENTS = {
  CREATE: {
    workspaceId: "The ID of the project to create the environment in.",
    name: "The name of the environment to create.",
    slug: "The slug of the environment to create."
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
  }
} as const;

export const FOLDERS = {
  LIST: {
    workspaceId: "The ID of the project to list folders from.",
    environment: "The slug of the environment to list folders from.",
    path: "The path to list folders from.",
    directory: "The directory to list folders from. (Deprecated in favor of path)"
  },
  CREATE: {
    workspaceId: "The ID of the project to create the folder in.",
    environment: "The slug of the environment to create the folder in.",
    name: "The name of the folder to create.",
    path: "The path of the folder to create.",
    directory: "The directory of the folder to create. (Deprecated in favor of path)"
  },
  UPDATE: {
    folderId: "The ID of the folder to update.",
    environment: "The slug of the environment where the folder is located.",
    name: "The new name of the folder.",
    path: "The path of the folder to update.",
    directory: "The new directory of the folder to update. (Deprecated in favor of path)",
    workspaceId: "The ID of the project where the folder is located."
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
    projectSlug: "The slug of the project where the secret is located",
    tagSlugs: "An array of tag slugs to attach to the secret."
  },
  DETACH_TAGS: {
    secretName: "The name of the secret to detach tags from.",
    secretPath: "The path of the secret to detach tags from.",
    type: "The type of the secret to attach tags to. (shared/personal)",
    environment: "The slug of the environment where the secret is located",
    projectSlug: "The slug of the project where the secret is located",
    tagSlugs: "An array of tag slugs to detach from the secret."
  }
} as const;

export const RAW_SECRETS = {
  LIST: {
    workspaceId: "The ID of the project to list secrets from.",
    workspaceSlug: "The slug of the project to list secrets from. This parameter is only usable by machine identities.",
    environment: "The slug of the environment to list secrets from.",
    secretPath: "The secret path to list secrets from.",
    includeImports: "Weather to include imported secrets or not."
  },
  CREATE: {
    secretName: "The name of the secret to create.",
    environment: "The slug of the environment to create the secret in.",
    secretComment: "Attach a comment to the secret.",
    secretPath: "The path to create the secret in.",
    secretValue: "The value of the secret to create.",
    skipMultilineEncoding: "Skip multiline encoding for the secret value.",
    type: "The type of the secret to create.",
    workspaceId: "The ID of the project to create the secret in."
  },
  GET: {
    secretName: "The name of the secret to get.",
    workspaceId: "The ID of the project to get the secret from.",
    environment: "The slug of the environment to get the secret from.",
    secretPath: "The path of the secret to get.",
    version: "The version of the secret to get.",
    type: "The type of the secret to get.",
    includeImports: "Weather to include imported secrets or not."
  },
  UPDATE: {
    secretName: "The name of the secret to update.",
    environment: "The slug of the environment where the secret is located.",
    secretPath: "The path of the secret to update",
    secretValue: "The new value of the secret.",
    skipMultilineEncoding: "Skip multiline encoding for the secret value.",
    type: "The type of the secret to update.",
    workspaceId: "The ID of the project to update the secret in."
  },
  DELETE: {
    secretName: "The name of the secret to delete.",
    environment: "The slug of the environment where the secret is located.",
    secretPath: "The path of the secret.",
    type: "The type of the secret to delete.",
    workspaceId: "The ID of the project where the secret is located."
  }
} as const;

export const SECRET_IMPORTS = {
  LIST: {
    workspaceId: "The ID of the project to list secret imports from.",
    environment: "The slug of the environment to list secret imports from.",
    path: "The path to list secret imports from."
  },
  CREATE: {
    environment: "The slug of the environment to import into.",
    path: "The path to import into.",
    workspaceId: "The ID of the project you are working in.",
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

export const AUDIT_LOGS = {
  EXPORT: {
    workspaceId: "The ID of the project to export audit logs from.",
    eventType: "The type of the event to export.",
    userAgentType: "Choose which consuming application to export audit logs for.",
    startDate: "The date to start the export from.",
    endDate: "The date to end the export at.",
    offset: "The offset to start from. If you enter 10, it will start from the 10th audit log.",
    limit: "The number of audit logs to return.",
    actor: "The actor to filter the audit logs by."
  }
} as const;

export const SECRET_TAGS = {
  LIST: {
    projectId: "The ID of the project to list tags from."
  },
  CREATE: {
    projectId: "The ID of the project to create the tag in.",
    name: "The name of the tag to create.",
    slug: "The slug of the tag to create.",
    color: "The color of the tag to create."
  },
  DELETE: {
    tagId: "The ID of the tag to delete.",
    projectId: "The ID of the project to delete the tag from."
  }
} as const;
