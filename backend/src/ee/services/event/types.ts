import { z } from "zod";

import { ProjectType } from "@app/db/schemas";

import { ProjectPermissionSecretEventActions } from "../permission/project-permission";

export enum TopicName {
  CoreServers = "infisical::core-servers"
}

export enum BusEventName {
  CreateSecret = "secret:create",
  UpdateSecret = "secret:update",
  DeleteSecret = "secret:delete",
  ImportMutation = "secret:import-mutation"
}

export const Mappings = {
  BusEventToAction(input: BusEventName) {
    switch (input) {
      case BusEventName.CreateSecret:
        return ProjectPermissionSecretEventActions.SubscribeToCreationEvents;
      case BusEventName.DeleteSecret:
        return ProjectPermissionSecretEventActions.SubscribeToDeleteEvents;
      case BusEventName.ImportMutation:
        return ProjectPermissionSecretEventActions.SubscribeToImportMutationEvents;
      case BusEventName.UpdateSecret:
        return ProjectPermissionSecretEventActions.SubscribeToUpdateEvents;
      default:
        throw new Error("Unknown bus event name");
    }
  }
};

export const EventName = z.nativeEnum(BusEventName);

const EventSecretPayload = z.object({
  secretId: z.string(),
  secretPath: z.string().optional(),
  secretKey: z.string(),
  environment: z.string()
});

const EventImportMutationPayload = z.object({
  secretPath: z.string(),
  environment: z.string()
});

export type EventSecret = z.infer<typeof EventSecretPayload>;

export const BusEventSchema = z.object({
  datacontenttype: z.literal("application/json").optional().default("application/json"),
  type: z.nativeEnum(ProjectType),
  source: z.string(),
  time: z
    .string()
    .optional()
    .default(() => new Date().toISOString()),
  data: z.discriminatedUnion("event", [
    z.object({
      specversion: z.number().optional().default(1),
      event: z.enum([BusEventName.CreateSecret, BusEventName.DeleteSecret, BusEventName.UpdateSecret]),
      payload: z.union([EventSecretPayload, EventSecretPayload.array()])
    }),
    z.object({
      specversion: z.number().optional().default(1),
      event: z.enum([BusEventName.ImportMutation]),
      payload: z.union([EventImportMutationPayload, EventImportMutationPayload.array()])
    })
    // Add more event types as needed
  ])
});

export type BusEvent = z.infer<typeof BusEventSchema>;

type PublishableEventPayload = z.input<typeof BusEventSchema>["data"];
type PublishableSecretEvent = Extract<
  PublishableEventPayload,
  { event: Exclude<BusEventName, BusEventName.ImportMutation> }
>["payload"];

export type PublishableEvent = {
  created?: PublishableSecretEvent;
  updated?: PublishableSecretEvent;
  deleted?: PublishableSecretEvent;
  importMutation?: Extract<PublishableEventPayload, { event: BusEventName.ImportMutation }>["payload"];
};

export const EventRegisterSchema = z.object({
  event: z.nativeEnum(BusEventName),
  conditions: z
    .object({
      secretPath: z.string().optional().default("/"),
      environmentSlug: z.string()
    })
    .optional()
});

export type RegisteredEvent = z.infer<typeof EventRegisterSchema>;
