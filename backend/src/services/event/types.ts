import { z } from "zod";

import { ProjectType } from "@app/db/schemas";

export enum TopicName {
  CoreServers = "infisical::core-servers"
}

export const EventName = z.union([z.literal("infisical:secret:create"), z.literal("infisical:secret:update")]);

export const EventSchema = z.object({
  datacontenttype: z.literal("application/json").optional().default("application/json"),
  type: z.nativeEnum(ProjectType),
  source: z.string(),
  time: z
    .string()
    .optional()
    .default(() => new Date().toISOString()),
  data: z.object({
    specversion: z.number().optional().default(1),
    event_type: z.string(),
    payload: z.record(z.string(), z.any())
  })
});

export type EventData = z.infer<typeof EventSchema>;
