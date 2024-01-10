export enum ActorType { // would extend to AWS, Azure, ...
    USER = "user", // userIdentity
    SERVICE = "service",
    IDENTITY = "identity"
}

export enum UserAgentType {
  WEB = "web",
  CLI = "cli",
  K8_OPERATOR = "k8-operator",
  TERRAFORM = "terraform",
  OTHER = "other",
  PYTHON_SDK = "InfisicalPythonSDK",
  NODE_SDK = "InfisicalNodeSDK"
}

export enum EventType {
  GET_SECRETS = "get-secrets",
  GET_SECRET = "get-secret",
  REVEAL_SECRET = "reveal-secret",
  CREATE_SECRET = "create-secret",
  CREATE_SECRETS = "create-secrets",
  UPDATE_SECRET = "update-secret",
  UPDATE_SECRETS = "update-secrets",
  DELETE_SECRET = "delete-secret",
  DELETE_SECRETS = "delete-secrets",
  GET_WORKSPACE_KEY = "get-workspace-key",
  AUTHORIZE_INTEGRATION = "authorize-integration",
  UNAUTHORIZE_INTEGRATION = "unauthorize-integration",
  CREATE_INTEGRATION = "create-integration",
  DELETE_INTEGRATION = "delete-integration",
  ADD_TRUSTED_IP = "add-trusted-ip",
  UPDATE_TRUSTED_IP = "update-trusted-ip",
  DELETE_TRUSTED_IP = "delete-trusted-ip",
  CREATE_SERVICE_TOKEN = "create-service-token", // v2
  DELETE_SERVICE_TOKEN = "delete-service-token", // v2
  CREATE_IDENTITY = "create-identity",
  UPDATE_IDENTITY = "update-identity",
  DELETE_IDENTITY = "delete-identity",
  LOGIN_IDENTITY_UNIVERSAL_AUTH = "login-identity-universal-auth",
  ADD_IDENTITY_UNIVERSAL_AUTH = "add-identity-universal-auth",
  UPDATE_IDENTITY_UNIVERSAL_AUTH = "update-identity-universal-auth",
  GET_IDENTITY_UNIVERSAL_AUTH = "get-identity-universal-auth",
  CREATE_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRET = "create-identity-universal-auth-client-secret",
  REVOKE_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRET =  "revoke-identity-universal-auth-client-secret",
  GET_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRETS = "get-identity-universal-auth-client-secret",
  CREATE_ENVIRONMENT = "create-environment",
  UPDATE_ENVIRONMENT = "update-environment",
  DELETE_ENVIRONMENT = "delete-environment",
  ADD_WORKSPACE_MEMBER = "add-workspace-member",
  ADD_BATCH_WORKSPACE_MEMBER = "add-workspace-members",
  REMOVE_WORKSPACE_MEMBER = "remove-workspace-member",
  CREATE_FOLDER = "create-folder",
  UPDATE_FOLDER = "update-folder",
  DELETE_FOLDER = "delete-folder",
  CREATE_WEBHOOK = "create-webhook",
  UPDATE_WEBHOOK_STATUS = "update-webhook-status",
  DELETE_WEBHOOK = "delete-webhook",
  GET_SECRET_IMPORTS = "get-secret-imports",
  CREATE_SECRET_IMPORT = "create-secret-import",
  UPDATE_SECRET_IMPORT = "update-secret-import",
  DELETE_SECRET_IMPORT = "delete-secret-import",
  UPDATE_USER_WORKSPACE_ROLE = "update-user-workspace-role",
  UPDATE_USER_WORKSPACE_DENIED_PERMISSIONS = "update-user-workspace-denied-permissions",
  SECRET_APPROVAL_MERGED = "secret-approval-merged",
  SECRET_APPROVAL_REQUEST = "secret-approval-request",
  SECRET_APPROVAL_CLOSED = "secret-approval-closed",
  SECRET_APPROVAL_REOPENED = "secret-approval-reopened"
}
