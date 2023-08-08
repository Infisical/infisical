import {
    ActorType,
    EventType
} from "./enums";

interface UserActorMetadata {
    userId: string;
    email: string;
}

interface ServiceActorMetadata {
    serviceId: string;
    name: string;
}

export interface UserActor {
    type: ActorType.USER;
    metadata: UserActorMetadata;
}

export interface ServiceActor {
    type: ActorType.SERVICE;
    metadata: ServiceActorMetadata;
}

export type Actor = 
    | UserActor
    | ServiceActor;

interface GetSecretsEvent {
    type: EventType.GET_SECRETS;
    metadata: {
        environment: string;
        secretPath: string;
        numberOfSecrets: number;
    };
}

interface GetSecretEvent {
    type: EventType.GET_SECRET;
    metadata: {
        environment: string;
        secretPath: string;
        secretId: string;
        secretKey: string;
        secretVersion: number;
    };
}

interface CreateSecretEvent {
    type: EventType.CREATE_SECRET;
    metadata: {
        environment: string;
        secretPath: string;
        secretId: string;
        secretKey: string;
        secretVersion: number;
    }
}

interface UpdateSecretEvent {
    type: EventType.UPDATE_SECRET;
    metadata: {
        environment: string;
        secretPath: string;
        secretId: string;
        secretKey: string;
        secretVersion: number;
    }
}

interface DeleteSecretEvent {
    type: EventType.DELETE_SECRET;
    metadata: {
        environment: string;
        secretPath: string;
        secretId: string;
        secretKey: string;
        secretVersion: number;
    }
}

interface AuthorizeIntegrationEvent {
    type: EventType.AUTHORIZE_INTEGRATION;
    metadata: {
        integration: string; // TODO: fix type
    }
}

interface UnauthorizeIntegrationEvent {
    type: EventType.UNAUTHORIZE_INTEGRATION;
    metadata: {
        integration: string; // TODO: fix type
    }
}

interface CreateIntegrationEvent {
    type: EventType.CREATE_INTEGRATION;
    metadata: {
        integrationId: string;
        integration: string; // TODO: fix type
        environment: string;
        secretPath: string;
        app?: string;
        targetEnvironment?: string;
        targetEnvironmentId?: string; // TODO: consider adding other vars
    }
}

interface DeleteIntegrationEvent {
    type: EventType.DELETE_INTEGRATION;
    metadata: {
        integrationId: string;
        integration: string; // TODO: fix type
        environment: string;
        secretPath: string;
        app?: string;
        targetEnvironment?: string;
        targetEnvironmentId?: string;
    }
}

interface AddTrustedIPEvent {
    type: EventType.ADD_TRUSTED_IP;
    metadata: {
        trustedIpId: string;
        ipAddress: string;
        prefix?: number;
    }
}

interface UpdateTrustedIPEvent {
    type: EventType.UPDATE_TRUSTED_IP;
    metadata: {
        trustedIpId: string;
        ipAddress: string;
        prefix?: number;
    }
}

interface DeleteTrustedIPEvent {
    type: EventType.DELETE_TRUSTED_IP;
    metadata: {
        trustedIpId: string;
        ipAddress: string;
        prefix?: number;
    }
}

interface CreateServiceTokenEvent {
    type: EventType.CREATE_SERVICE_TOKEN;
    metadata: {
        name: string;
        scopes: Array<{
            environment: string;
            secretPath: string;
        }>;
    }
}

interface DeleteServiceTokenEvent {
    type: EventType.DELETE_SERVICE_TOKEN;
    metadata: {
        name: string;
        scopes: Array<{
            environment: string;
            secretPath: string;
        }>;
    }
}

interface CreateEnvironmentEvent {
    type: EventType.CREATE_ENVIRONMENT;
    metadata: {
        name: string;
        slug: string;
    }
}

interface UpdateEnvironmentEvent {
    type: EventType.UPDATE_ENVIRONMENT;
    metadata: {
        oldName: string;
        newName: string;
        oldSlug: string;
        newSlug: string;
    }
}

interface DeleteEnvironmentEvent {
    type: EventType.DELETE_ENVIRONMENT;
    metadata: {
        name: string;
        slug: string;
    }
}

interface AddWorkspaceMemberEvent {
    type: EventType.ADD_WORKSPACE_MEMBER;
    metadata: {
        userId: string;
        email: string;
    }
}

interface RemoveWorkspaceMemberEvent {
    type: EventType.REMOVE_WORKSPACE_MEMBER;
    metadata: {
        userId: string;
        email: string;
    }
}

interface CreateFolderEvent {
    type: EventType.CREATE_FOLDER;
    metadata: {
        environment: string;
        folderId: string;
        folderName: string;
        folderPath: string;
    }
}

interface UpdateFolderEvent {
    type: EventType.UPDATE_FOLDER;
    metadata: {
        environment: string;
        folderId: string;
        oldFolderName: string;
        newFolderName: string;
        folderPath: string;
    }
}

interface DeleteFolderEvent {
    type: EventType.DELETE_FOLDER;
    metadata: {
        environment: string;
        folderId: string;
        folderName: string;
        folderPath: string;
    }
}

interface CreateWebhookEvent {
    type: EventType.CREATE_WEBHOOK,
    metadata: {
        webhookId: string;
        environment: string;
        secretPath: string;
        webhookUrl: string;
        isDisabled: boolean;
    }
}

interface UpdateWebhookStatusEvent {
    type: EventType.UPDATE_WEBHOOK_STATUS,
    metadata: {
        webhookId: string;
        environment: string;
        secretPath: string;
        webhookUrl: string;
        isDisabled: boolean;
    }
}

interface DeleteWebhookEvent {
    type: EventType.DELETE_WEBHOOK,
    metadata: {
        webhookId: string;
        environment: string;
        secretPath: string;
        webhookUrl: string;
        isDisabled: boolean;
    }
}

export type Event = 
    | GetSecretsEvent
    | GetSecretEvent
    | CreateSecretEvent
    | UpdateSecretEvent
    | DeleteSecretEvent
    | AuthorizeIntegrationEvent
    | UnauthorizeIntegrationEvent
    | CreateIntegrationEvent
    | DeleteIntegrationEvent
    | AddTrustedIPEvent
    | UpdateTrustedIPEvent
    | DeleteTrustedIPEvent
    | CreateServiceTokenEvent
    | DeleteServiceTokenEvent
    | CreateEnvironmentEvent
    | UpdateEnvironmentEvent
    | DeleteEnvironmentEvent
    | AddWorkspaceMemberEvent
    | RemoveWorkspaceMemberEvent
    | CreateFolderEvent
    | UpdateFolderEvent
    | DeleteFolderEvent
    | CreateWebhookEvent
    | UpdateWebhookStatusEvent
    | DeleteWebhookEvent;