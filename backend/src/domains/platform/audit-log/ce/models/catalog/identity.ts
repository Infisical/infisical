import { EventType } from "../event-type";

export interface AddTrustedIPEvent {
  type: EventType.ADD_TRUSTED_IP;
  metadata: {
    trustedIpId: string;
    ipAddress: string;
    prefix?: number;
  };
}

export interface UpdateTrustedIPEvent {
  type: EventType.UPDATE_TRUSTED_IP;
  metadata: {
    trustedIpId: string;
    ipAddress: string;
    prefix?: number;
  };
}

export interface DeleteTrustedIPEvent {
  type: EventType.DELETE_TRUSTED_IP;
  metadata: {
    trustedIpId: string;
    ipAddress: string;
    prefix?: number;
  };
}

export interface CreateServiceTokenEvent {
  type: EventType.CREATE_SERVICE_TOKEN;
  metadata: {
    name: string;
    scopes: Array<{
      environment: string;
      secretPath: string;
    }>;
  };
}

export interface DeleteServiceTokenEvent {
  type: EventType.DELETE_SERVICE_TOKEN;
  metadata: {
    name: string;
    scopes: Array<{
      environment: string;
      secretPath: string;
    }>;
  };
}

export interface CreateIdentityEvent {
  type: EventType.CREATE_IDENTITY;
  metadata: {
    identityId: string;
    name: string;
    hasDeleteProtection: boolean;
    metadata?: { key: string; value: string }[];
    roles?: (
      | { role: string; isTemporary: false }
      | {
          role: string;
          isTemporary: true;
          temporaryMode: string;
          temporaryRange: string;
          temporaryAccessStartTime: string;
        }
    )[];
  };
}

export interface UpdateIdentityEvent {
  type: EventType.UPDATE_IDENTITY;
  metadata: {
    identityId: string;
    name?: string;
    hasDeleteProtection?: boolean;
    metadata?: { key: string; value: string }[];
  };
}

export interface DeleteIdentityEvent {
  type: EventType.DELETE_IDENTITY;
  metadata: {
    identityId: string;
  };
}

export interface CreateIdentityOrgMembershipEvent {
  type: EventType.CREATE_IDENTITY_ORG_MEMBERSHIP;
  metadata: {
    identityId: string;
    roles: unknown;
  };
}

export interface UpdateIdentityOrgMembershipEvent {
  type: EventType.UPDATE_IDENTITY_ORG_MEMBERSHIP;
  metadata: {
    identityId: string;
    roles?: unknown;
  };
}

export interface DeleteIdentityOrgMembershipEvent {
  type: EventType.DELETE_IDENTITY_ORG_MEMBERSHIP;
  metadata: {
    identityId: string;
  };
}

export interface CreateIdentityProjectMembershipEvent {
  type: EventType.CREATE_IDENTITY_PROJECT_MEMBERSHIP;
  metadata: {
    identityId: string;
    roles: unknown;
  };
}

export interface UpdateIdentityProjectMembershipEvent {
  type: EventType.UPDATE_IDENTITY_PROJECT_MEMBERSHIP;
  metadata: {
    identityId: string;
    roles?: unknown;
  };
}

export interface DeleteIdentityProjectMembershipEvent {
  type: EventType.DELETE_IDENTITY_PROJECT_MEMBERSHIP;
  metadata: {
    identityId: string;
  };
}

export interface GetProjectIdentityPermissionAuditEvent {
  type: EventType.GET_PROJECT_IDENTITY_PERMISSION_AUDIT;
  metadata: {
    targetIdentityId: string;
  };
}

export interface AddIdentityToGroupEvent {
  type: EventType.ADD_IDENTITY_TO_GROUP;
  metadata: {
    groupId: string;
    groupName: string;
    identityId: string;
  };
}

export interface RemoveIdentityFromGroupEvent {
  type: EventType.REMOVE_IDENTITY_FROM_GROUP;
  metadata: {
    groupId: string;
    groupName: string;
    identityId: string;
  };
}

export type TIdentityAuditLogEvent =
  | AddTrustedIPEvent
  | UpdateTrustedIPEvent
  | DeleteTrustedIPEvent
  | CreateServiceTokenEvent
  | DeleteServiceTokenEvent
  | CreateIdentityEvent
  | UpdateIdentityEvent
  | DeleteIdentityEvent
  | CreateIdentityOrgMembershipEvent
  | UpdateIdentityOrgMembershipEvent
  | DeleteIdentityOrgMembershipEvent
  | CreateIdentityProjectMembershipEvent
  | UpdateIdentityProjectMembershipEvent
  | DeleteIdentityProjectMembershipEvent
  | GetProjectIdentityPermissionAuditEvent
  | AddIdentityToGroupEvent
  | RemoveIdentityFromGroupEvent;
