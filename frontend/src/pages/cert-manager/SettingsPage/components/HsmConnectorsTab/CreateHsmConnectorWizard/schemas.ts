import { z } from "zod";

import { slugSchema } from "@app/lib/schemas";

export const basicsSchema = z.object({
  name: slugSchema({ min: 1, max: 32, field: "Name" }),
  description: z.string().trim().max(256).optional()
});
export type BasicsForm = z.infer<typeof basicsSchema>;

export const hostSchema = z.object({
  reachedFrom: z.string().min(1, "Pick a Gateway that can reach your HSM")
});
export type HostForm = z.infer<typeof hostSchema>;

export const accessSchema = z.object({
  slotLabel: z.string().min(1, "Slot label is required").max(128),
  pin: z.string().min(1, "PIN is required").max(512),
  keyNamePrefix: z.string().trim().max(64).optional()
});
export type AccessForm = z.infer<typeof accessSchema>;
