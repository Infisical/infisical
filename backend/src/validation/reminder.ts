import { z } from "zod";

export const GetSecretReminder = z.object({
  params: z.object({
    secretID: z.string().trim()
  })
});

export const CreateSecretReminder = z.object({
  params: z.object({
    secretID: z.string().trim()
  }),
  body: z.object({
    frequency: z.number(),
    note: z.string().trim()
  })
});

export const UpdateSecretReminder = z.object({
  params: z.object({
    reminderID: z.string().trim()
  }),
  body: z.object({
    frequency: z.number(),
    note: z.string().trim()
  })
});

export const DeleteSecretReminder = z.object({
  params: z.object({
    reminderID: z.string().trim()
  })
});