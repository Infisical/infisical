import { z } from "zod";

import { ProjectType } from "@app/db/schemas";
import { Event, EventType } from "@app/ee/services/audit-log/audit-log-types";

export enum TopicName {
  CoreServers = "infisical::core-servers"
}

export enum BusEventName {
  CreateSecret = "secret:create",
  UpdateSecret = "secret:update",
  DeleteSecret = "secret:delete"
}

type PublisableEventTypes =
  | EventType.CREATE_SECRET
  | EventType.CREATE_SECRETS
  | EventType.DELETE_SECRET
  | EventType.DELETE_SECRETS
  | EventType.UPDATE_SECRETS
  | EventType.UPDATE_SECRET;

export function toBusEventName(input: EventType) {
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

const isBulkEvent = (event: Event): event is Extract<Event, { metadata: { secrets: Array<unknown> } }> => {
  return event.type.endsWith("-secrets"); // Feels so wrong
};

export const toPublishableEvent = (event: Event) => {
  const name = toBusEventName(event.type);

  if (!name) return null;

  const e = event as Extract<Event, { type: PublisableEventTypes }>;

  if (isBulkEvent(e)) {
    return {
      name,
      isBulk: true,
      data: {
        eventType: e.type,
        payload: e.metadata.secrets.map((s) => ({
          environment: e.metadata.environment,
          secretPath: e.metadata.secretPath,
          ...s
        }))
      }
    } as const;
  }

  return {
    name,
    isBulk: false,
    data: {
      eventType: e.type,
      payload: {
        ...e.metadata,
        environment: e.metadata.environment
      }
    }
  } as const;
};

export const EventName = z.nativeEnum(BusEventName);

const EventSecretPayload = z.object({
  secretPath: z.string().optional(),
  secretId: z.string(),
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
  event: EventName,
  conditions: z
    .object({
      secretPath: z.string().optional().default("/"),
      environmentSlug: z.string(),
      recursive: z.boolean().optional().default(false)
    })
    .optional()
});

export type RegisteredEvent = z.infer<typeof EventRegisterSchema>;
