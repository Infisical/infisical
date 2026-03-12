import { z } from "zod";

export const AppConnectionCredentialRotationRotateAtUtcSchema = z.object({
  hours: z.number().int().min(0).max(23).describe("The hour (0-23) at which to rotate."),
  minutes: z.number().int().min(0).max(59).describe("The minute (0-59) at which to rotate.")
});

export const CreateAppConnectionCredentialRotationSchema = z.object({
  rotationInterval: z.number().int().min(1).max(365).describe("The interval in days between credential rotations."),
  rotateAtUtc: AppConnectionCredentialRotationRotateAtUtcSchema
});

export const UpdateAppConnectionCredentialRotationSchema = z.object({
  rotationInterval: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .describe("The interval in days between credential rotations."),
  rotateAtUtc: AppConnectionCredentialRotationRotateAtUtcSchema.optional()
});
