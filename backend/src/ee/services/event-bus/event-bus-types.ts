import { z } from "zod";

// Topic names for Redis pub/sub channels
export enum EventBusTopicName {
  CoreServers = "infisical::core-servers"
}

// Event types that can be published/subscribed
export enum EventBusServiceEvents {
  SecretCreated = "secret.created",
  SecretUpdated = "secret.updated",
  SecretDeleted = "secret.deleted",
  SecretImportMutation = "secret.import-mutation"
}

// Base event schema - all events must have these fields
export const EventBusSchema = z.object({
  type: z.nativeEnum(EventBusServiceEvents),
  timestamp: z.string().datetime(),
  sourceContainer: z.string(),
  payload: z.record(z.unknown())
});

export type TEventBusEvent = z.infer<typeof EventBusSchema>;

// Subscriber callback type
export type TEventBusSubscriber = (event: TEventBusEvent) => void | Promise<void>;

// Unsubscribe function type
export type TEventBusUnsubscribe = () => void;
