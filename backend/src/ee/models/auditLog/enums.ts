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
    DELETE_SECRET = "delete-secret"
}