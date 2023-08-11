export enum ActorType {
    USER = "user",
    SERVICE = "service"
}

export enum UserAgentType {
    WEB = "web",
    CLI = "cli",
    K8_OPERATOR = "k8-operator",
    OTHER = "other"
}

export enum EventType {
    GET_SECRETS = "get-secrets",
    GET_SECRET = "get-secret",
    REVEAL_SECRET = "reveal-secret",
    CREATE_SECRET = "create-secret",
    UPDATE_SECRET = "update-secret",
    DELETE_SECRET = "delete-secret",
    GET_WORKSPACE_KEY = "get-workspace-key",
    AUTHORIZE_INTEGRATION = "authorize-integration",
    UNAUTHORIZE_INTEGRATION = "unauthorize-integration",
    CREATE_INTEGRATION = "create-integration",
    DELETE_INTEGRATION = "delete-integration",
    ADD_TRUSTED_IP = "add-trusted-ip",
    UPDATE_TRUSTED_IP = "update-trusted-ip",
    DELETE_TRUSTED_IP = "delete-trusted-ip",
    CREATE_SERVICE_TOKEN = "create-service-token",
    DELETE_SERVICE_TOKEN = "delete-service-token",
    CREATE_ENVIRONMENT = "create-environment",
    UPDATE_ENVIRONMENT = "update-environment",
    DELETE_ENVIRONMENT = "delete-environment",
    ADD_WORKSPACE_MEMBER = "add-workspace-member",
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
    UPDATE_USER_WORKSPACE_DENIED_PERMISSIONS = "update-user-workspace-denied-permissions"
}