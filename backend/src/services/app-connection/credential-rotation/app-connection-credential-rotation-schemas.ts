import { z } from "zod";

export const AppConnectionCredentialRotationRotateAtUtcSchema = z.object({
  hours: z.number().int().min(0).max(23),
  minutes: z.number().int().min(0).max(59)
});

export const CreateAppConnectionCredentialRotationSchema = z.object({
  rotationInterval: z.number().int().min(1).max(365),
  rotateAtUtc: AppConnectionCredentialRotationRotateAtUtcSchema
});

export const UpdateAppConnectionCredentialRotationSchema = z.object({
  rotationInterval: z.number().int().min(1).max(365).optional(),
  rotateAtUtc: z
    .object({
      hours: z.number().int().min(0).max(23),
      minutes: z.number().int().min(0).max(59)
    })
    .optional(),
  isAutoRotationEnabled: z.boolean().optional()
});
