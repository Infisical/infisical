import { z } from "zod";

export const AddMCPEndpointFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(64, "Name cannot exceed 64 characters"),
  description: z.string().trim().max(256, "Description cannot exceed 256 characters").optional(),
  serverIds: z.array(z.string().uuid()).default([])
});

export type TAddMCPEndpointForm = z.infer<typeof AddMCPEndpointFormSchema>;
