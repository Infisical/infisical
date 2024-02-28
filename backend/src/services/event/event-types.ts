import { z } from "zod";

export enum TEventType {
  SECRET_UPDATE = "secret_update",
  SECRET_DELETE = "secret_delete",
  SECRET_CREATE = "secret_create"
}

export const EventSchema = z.object({
  secret_create: z.object({
    payload: z.object({
      secretId: z.string(),
      secretKey: z.string(),
      secretPath: z.string()
    }),
    type: z.literal("secret_create")
  }),
  secret_update: z.object({
    payload: z.object({
      secretId: z.string(),
      secretKey: z.string(),
      secretPath: z.string()
    }),
    type: z.literal("secret_update")
  }),
  secret_delete: z.object({
    payload: z.object({
      secretId: z.string(),
      secretPath: z.string()
    }),
    type: z.literal("secret_delete")
  })
});

export type TEvent = z.infer<typeof EventSchema>;
