import { EventType } from "../event-type";

// Lands in the summary event's metadata when a collapse window closes. Add it to the metadata
// type of any event you pass to createCollapsedAuditLog.
export type TAuditLogCollapseSummary = {
  suppressedRepeats?: number;
  suppressedFrom?: string;
  suppressedUntil?: string;
};

export interface CreateAlertEvent {
  type: EventType.CREATE_ALERT;
  metadata: {
    alertId: string;
    name: string;
    resourceType: string;
    resourceId?: string | null;
    resourceName?: string | null;
    eventType: string;
  };
}

export interface UpdateAlertEvent {
  type: EventType.UPDATE_ALERT;
  metadata: {
    alertId: string;
    name: string;
    resourceType: string;
    resourceId?: string | null;
    resourceName?: string | null;
    eventType: string;
  };
}

export interface DeleteAlertEvent {
  type: EventType.DELETE_ALERT;
  metadata: {
    alertId: string;
    name: string;
    resourceType: string;
    resourceId?: string | null;
    resourceName?: string | null;
    eventType: string;
  };
}

export interface TestAlertChannelEvent {
  type: EventType.TEST_ALERT_CHANNEL;
  metadata: {
    channelId?: string;
    channelType: string;
    resourceType: string;
    resourceId?: string | null;
    resourceName?: string | null;
    success: boolean;
    deliveredTo?: number;
    error?: string;
  };
}

type TAuditLogStreamEventMetadata = {
  logStreamId: string;
  provider: string;
  destinationHost: string;
  filters: { products?: string[]; pamSessionActivity?: { includeOutput: boolean } | null } | null;
};

export interface CreateAuditLogStreamEvent {
  type: EventType.CREATE_AUDIT_LOG_STREAM;
  metadata: TAuditLogStreamEventMetadata;
}

export interface UpdateAuditLogStreamEvent {
  type: EventType.UPDATE_AUDIT_LOG_STREAM;
  metadata: TAuditLogStreamEventMetadata;
}

export interface DeleteAuditLogStreamEvent {
  type: EventType.DELETE_AUDIT_LOG_STREAM;
  metadata: { logStreamId: string; provider: string; destinationHost: string };
}

export type TMiscAuditLogEvent =
  | CreateAlertEvent
  | UpdateAlertEvent
  | DeleteAlertEvent
  | TestAlertChannelEvent
  | CreateAuditLogStreamEvent
  | UpdateAuditLogStreamEvent
  | DeleteAuditLogStreamEvent;
