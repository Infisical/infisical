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

export type Event = 
    | GetSecretsEvent
    | GetSecretEvent
    | CreateSecretEvent
    | UpdateSecretEvent
    | DeleteSecretEvent;