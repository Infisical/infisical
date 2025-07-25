import { z } from "zod";

export enum TopicName {
  CoreServers = "infisical::core-servers"
}

export const EventSchema = z.object({
  datacontenttype: z.literal("application/json").optional().default("application/json"),
  type: z.string(),
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
