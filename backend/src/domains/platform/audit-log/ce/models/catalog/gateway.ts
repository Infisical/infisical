import { EventType } from "../event-type";
import type {
  TAuditLogCertKeyAlgorithm,
  TAuditLogGatewayTransport,
  TAuditLogResourceAuthMethodType,
  TAuditLogSettableAuthMethod
} from "./shared";

export interface RegisterKmipServerEvent {
  type: EventType.REGISTER_KMIP_SERVER;
  metadata: {
    serverCertificateSerialNumber: string;
    hostnamesOrIps: string;
    commonName: string;
    keyAlgorithm: TAuditLogCertKeyAlgorithm;
    ttl: string;
  };
}

export interface KmipServerConnectEvent {
  type: EventType.KMIP_SERVER_CONNECT;
  metadata: {
    serverCertificateSerialNumber: string;
    hostnamesOrIps: string;
    commonName: string;
    keyAlgorithm: TAuditLogCertKeyAlgorithm;
    ttl: string;
  };
}

export interface GatewayCreateEvent {
  type: EventType.GATEWAY_CREATE;
  metadata: {
    gatewayId: string;
    name: string;
  };
}

export interface GatewayUpdateEvent {
  type: EventType.GATEWAY_UPDATE;
  metadata: {
    gatewayId: string;
    name: string;
    previousName: string;
  };
}

export interface GatewayDeleteEvent {
  type: EventType.GATEWAY_DELETE;
  metadata: {
    gatewayId: string;
    name: string;
  };
}

export interface GatewayEnrollmentTokenCreateEvent {
  type: EventType.GATEWAY_ENROLLMENT_TOKEN_CREATE;
  metadata: {
    tokenId: string;
    name: string;
  };
}

export interface GatewayEnrollEvent {
  type: EventType.GATEWAY_ENROLL;
  metadata: {
    gatewayId: string;
    name: string;
  };
}

export interface GatewayConnectEvent {
  type: EventType.GATEWAY_CONNECT;
  metadata: {
    gatewayId: string;
    name: string;
    transports: TAuditLogGatewayTransport[];
    directAddress?: string;
    relayName?: string;
  };
}

export type ResourceAuthMethodKind = TAuditLogSettableAuthMethod;

export type ResourceAuthMethodResourceType = "gateway" | "relay" | "kmip";

export interface ResourceAuthMethodLoginEvent {
  type: EventType.RESOURCE_AUTH_METHOD_LOGIN;
  metadata: {
    resourceType: ResourceAuthMethodResourceType;
    resourceId: string;
    resourceName?: string;
    method: ResourceAuthMethodKind;
    methodConfigId: string;
    principalArn?: string;
    accountId?: string;
    enrollmentTokenId?: string;
    kubernetesNamespace?: string;
    kubernetesServiceAccountName?: string;
    gcpServiceAccountEmail?: string;
    gcpProjectId?: string;
    gcpZone?: string;
  };
}

export interface ResourceAuthMethodLoginFailedEvent {
  type: EventType.RESOURCE_AUTH_METHOD_LOGIN_FAILED;
  metadata: {
    resourceType: ResourceAuthMethodResourceType;
    resourceId: string;
    resourceName?: string;
    method: ResourceAuthMethodKind;
    reasonCode: string;
    message: string;
    principalArn?: string;
    accountId?: string;
    kubernetesNamespace?: string;
    kubernetesServiceAccountName?: string;
    gcpServiceAccountEmail?: string;
    gcpProjectId?: string;
    gcpZone?: string;
  };
}

export interface ResourceAuthMethodConfigMetadata {
  resourceType: ResourceAuthMethodResourceType;
  resourceId: string;
  resourceName?: string;
  method: TAuditLogResourceAuthMethodType;
  methodConfigId: string;
  allowedPrincipalArns?: string;
  allowedAccountIds?: string;
  kubernetesHost?: string;
  allowedNamespaces?: string;
  allowedNames?: string;
  allowedAudience?: string;
  gcpAuthType?: string;
  allowedServiceAccounts?: string;
  allowedProjects?: string;
  allowedZones?: string;
}

export interface ResourceAuthMethodCreateEvent {
  type: EventType.RESOURCE_AUTH_METHOD_CREATE;
  metadata: ResourceAuthMethodConfigMetadata;
}

export interface ResourceAuthMethodUpdateEvent {
  type: EventType.RESOURCE_AUTH_METHOD_UPDATE;
  metadata: ResourceAuthMethodConfigMetadata;
}

export interface ResourceAuthMethodRevokeEvent {
  type: EventType.RESOURCE_AUTH_METHOD_REVOKE;
  metadata: {
    resourceType: ResourceAuthMethodResourceType;
    resourceId: string;
    method: ResourceAuthMethodKind;
    resourceName: string;
  };
}

export interface RelayCreateEvent {
  type: EventType.RELAY_CREATE;
  metadata: {
    relayId: string;
    name: string;
  };
}

export interface RelayUpdateEvent {
  type: EventType.RELAY_UPDATE;
  metadata: {
    relayId: string;
    name: string;
    host: string;
  };
}

export interface RelayDeleteEvent {
  type: EventType.RELAY_DELETE;
  metadata: {
    relayId: string;
    name: string;
  };
}

export interface RelayEnrollmentTokenCreateEvent {
  type: EventType.RELAY_ENROLLMENT_TOKEN_CREATE;
  metadata: {
    tokenId: string;
    name: string;
  };
}

export interface KmipServerCreateEvent {
  type: EventType.KMIP_SERVER_CREATE;
  metadata: {
    kmipServerId: string;
    name: string;
  };
}

export interface KmipServerUpdateEvent {
  type: EventType.KMIP_SERVER_UPDATE;
  metadata: {
    kmipServerId: string;
    name: string;
  };
}

export interface KmipServerDeleteEvent {
  type: EventType.KMIP_SERVER_DELETE;
  metadata: {
    kmipServerId: string;
    name: string;
  };
}

export interface KmipServerEnrollmentTokenCreateEvent {
  type: EventType.KMIP_SERVER_ENROLLMENT_TOKEN_CREATE;
  metadata: {
    tokenId: string;
    name: string;
  };
}

export interface GatewayPoolCreateEvent {
  type: EventType.GATEWAY_POOL_CREATE;
  metadata: {
    poolId: string;
    name: string;
  };
}

export interface GatewayPoolUpdateEvent {
  type: EventType.GATEWAY_POOL_UPDATE;
  metadata: {
    poolId: string;
    name: string;
  };
}

export interface GatewayPoolDeleteEvent {
  type: EventType.GATEWAY_POOL_DELETE;
  metadata: {
    poolId: string;
    name: string;
  };
}

export interface GatewayPoolAddMemberEvent {
  type: EventType.GATEWAY_POOL_ADD_MEMBER;
  metadata: {
    poolId: string;
    poolName: string;
    gatewayId: string;
    gatewayName: string;
  };
}

export interface GatewayPoolRemoveMemberEvent {
  type: EventType.GATEWAY_POOL_REMOVE_MEMBER;
  metadata: {
    poolId: string;
    poolName: string;
    gatewayId: string;
    gatewayName: string;
  };
}

export type TGatewayAuditLogEvent =
  | RegisterKmipServerEvent
  | KmipServerConnectEvent
  | GatewayCreateEvent
  | GatewayUpdateEvent
  | GatewayDeleteEvent
  | GatewayEnrollmentTokenCreateEvent
  | GatewayEnrollEvent
  | GatewayConnectEvent
  | ResourceAuthMethodLoginEvent
  | ResourceAuthMethodLoginFailedEvent
  | ResourceAuthMethodCreateEvent
  | ResourceAuthMethodUpdateEvent
  | ResourceAuthMethodRevokeEvent
  | RelayCreateEvent
  | RelayUpdateEvent
  | RelayDeleteEvent
  | RelayEnrollmentTokenCreateEvent
  | KmipServerCreateEvent
  | KmipServerUpdateEvent
  | KmipServerDeleteEvent
  | KmipServerEnrollmentTokenCreateEvent
  | GatewayPoolCreateEvent
  | GatewayPoolUpdateEvent
  | GatewayPoolDeleteEvent
  | GatewayPoolAddMemberEvent
  | GatewayPoolRemoveMemberEvent;
