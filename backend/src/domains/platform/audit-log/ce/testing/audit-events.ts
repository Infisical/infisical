import { ActorType } from "@app/lib/auth/actor-types";

import type { TAuditLogActorRecord } from "../models/audit-log-actor";
import type { TAuditLogEvent } from "../models/catalog";
import { EventType } from "../models/event-type";

// One event of each class, for tests that only care which class an event is in.
export const managementEvent = () =>
  ({
    type: EventType.CREATE_SECRET,
    metadata: { environment: "dev", secretPath: "/", secretId: "s1", secretKey: "K", secretVersion: 1 }
  }) as TAuditLogEvent;

export const dataAccessEvent = () =>
  ({
    type: EventType.GET_SECRETS,
    metadata: { environment: "dev", secretPath: "/", numberOfSecrets: 1 }
  }) as TAuditLogEvent;

export const authenticationEvent = () => ({ type: EventType.USER_LOGIN, metadata: {} }) as TAuditLogEvent;

export const authorizationEvent = () => ({ type: EventType.PERMISSION_DENIED, metadata: {} }) as TAuditLogEvent;

export const platformActorRecord = (): TAuditLogActorRecord => ({ type: ActorType.PLATFORM, metadata: {} });
