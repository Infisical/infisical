import { z } from "zod";

import { AWSRegion } from "@app/services/app-connection/app-connection-enums";

import { PamRecordingStorageBackend } from "../pam-session-recording/pam-recording-enums";

export const PamPasswordConstraintsSchema = z.object({
  minLength: z.number().int().min(1).max(256),
  maxLength: z.number().int().min(1).max(256),
  requireUppercase: z.boolean(),
  requireLowercase: z.boolean(),
  requireNumbers: z.boolean(),
  requireSymbols: z.boolean()
});

export const PamRecordingS3ConfigSchema = z.object({
  bucket: z.string().trim().min(1),
  region: z.nativeEnum(AWSRegion),
  keyPrefix: z.string().trim().optional()
});

export const PamAccountSettingsOverridesSchema = z.object({
  recordingS3Config: PamRecordingS3ConfigSchema.optional()
});

export const PamTemplateSettingsSchema = z.object({
  recordingEnabled: z.boolean().default(true),
  recordingStorageBackend: z.nativeEnum(PamRecordingStorageBackend).default(PamRecordingStorageBackend.Postgres),
  recordingS3Config: PamRecordingS3ConfigSchema.optional(),
  passwordConstraints: PamPasswordConstraintsSchema.optional(),
  sessionLogMaskingPatterns: z.array(z.string().min(1).max(500)).max(20).optional()
});

export type TPamTemplateSettings = z.infer<typeof PamTemplateSettingsSchema>;
export type TPamPasswordConstraints = z.infer<typeof PamPasswordConstraintsSchema>;
