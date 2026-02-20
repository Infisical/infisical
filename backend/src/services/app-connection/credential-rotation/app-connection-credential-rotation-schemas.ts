import { z } from "zod";

import { AppConnectionCredentialRotationStatus } from "./app-connection-credential-rotation-enums";

export const CreateAppConnectionCredentialRotationSchema = z.object({
  rotationInterval: z.number().int().min(1).max(365),
  rotateAtUtc: z.object({
    hours: z.number().int().min(0).max(23),
    minutes: z.number().int().min(0).max(59)
  })
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

export const SanitizedAppConnectionCredentialRotationSchema = z.object({
  id: z.string().uuid(),
  connectionId: z.string().uuid(),
  strategy: z.string(),
  rotationInterval: z.number(),
  rotateAtUtc: z.object({
    hours: z.number(),
    minutes: z.number()
  }),
  rotationStatus: z.nativeEnum(AppConnectionCredentialRotationStatus),
  lastRotationAttemptedAt: z.date().nullable(),
  lastRotatedAt: z.date().nullable(),
  lastRotationMessage: z.string().nullable(),
  lastRotationJobId: z.string().nullable(),
  nextRotationAt: z.date().nullable(),
  activeIndex: z.number(),
  createdAt: z.date(),
  updatedAt: z.date()
});
