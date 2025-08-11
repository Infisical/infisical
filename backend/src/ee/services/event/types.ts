import { z } from "zod";

import { ProjectType } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ProjectPermissionSecretEventActions, ProjectPermissionSub } from "../permission/project-permission";

export enum TopicName {
  CoreServers = "infisical::core-servers"
}

export enum BusEventName {
  CreateSecret = "secret:create",
  UpdateSecret = "secret:update",
  DeleteSecret = "secret:delete"
}

export type PublisableEventTypes =
  | EventType.CREATE_SECRET
  | EventType.CREATE_SECRETS
  | EventType.DELETE_SECRET
  | EventType.DELETE_SECRETS
  | EventType.UPDATE_SECRETS
  | EventType.UPDATE_SECRET;

export const NameMappings = {
  ActionToBusEvent(input: ProjectPermissionSecretEventActions) {
    switch (input) {
      case ProjectPermissionSecretEventActions.SubscribeCreated:
        return BusEventName.CreateSecret;
      case ProjectPermissionSecretEventActions.SubscribeUpdated:
        return BusEventName.UpdateSecret;
      case ProjectPermissionSecretEventActions.SubscribeDeleted:
        return BusEventName.DeleteSecret;
      default:
        return null;
    }
  },
  EventTypeToBusEvent(input: EventType) {
    switch (input) {
      case EventType.CREATE_SECRET:
      case EventType.CREATE_SECRETS:
        return BusEventName.CreateSecret;
      case EventType.UPDATE_SECRET:
      case EventType.UPDATE_SECRETS:
        return BusEventName.UpdateSecret;
      case EventType.DELETE_SECRET:
      case EventType.DELETE_SECRETS:
        return BusEventName.DeleteSecret;
      default:
        return null;
    }
  }
};

export type SecretEventData =
  | {
      secretId: string;
      secretKey: string;
      secretPath: string;
      environment: string;
    }
  | Array<{
      secretId: string;
      secretKey: string;
      secretPath: string;
      environment: string;
    }>;

export const EventName = z.nativeEnum(BusEventName);

const EventSecretPayload = z.object({
  secretId: z.string(),
  secretPath: z.string().optional(),
  secretKey: z.string(),
  environment: z.string()
});

export type EventSecret = z.infer<typeof EventSecretPayload>;

export const EventSchema = z.object({
  datacontenttype: z.literal("application/json").optional().default("application/json"),
  type: z.nativeEnum(ProjectType),
  source: z.string(),
  time: z
    .string()
    .optional()
    .default(() => new Date().toISOString()),
  data: z.discriminatedUnion("eventType", [
    z.object({
      specversion: z.number().optional().default(1),
      eventType: z.enum([EventType.CREATE_SECRET, EventType.UPDATE_SECRET, EventType.DELETE_SECRET]),
      payload: EventSecretPayload
    }),
    z.object({
      specversion: z.number().optional().default(1),
      eventType: z.enum([EventType.CREATE_SECRETS, EventType.UPDATE_SECRETS, EventType.DELETE_SECRETS]),
      payload: EventSecretPayload.array()
    })
    // Add more event types as needed
  ])
});

export type EventData = z.infer<typeof EventSchema>;

export const EventRegisterSchema = z.object({
  subject: z.enum([ProjectPermissionSub.SecretEvents]),
  action: z.nativeEnum(ProjectPermissionSecretEventActions),
  conditions: z
    .object({
      secretPath: z.string().optional().default("/"),
      environmentSlug: z.string()
    })
    .optional()
});

export type RegisteredEvent = z.infer<typeof EventRegisterSchema>;
