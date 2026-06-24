import { z } from "zod";

import { patternsStringSchema } from "../pam/pam-policies";
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
  bucket: z.string().min(1),
  region: z.string().min(1),
  keyPrefix: z.string().optional()
});

export const PamTemplateSettingsSchema = z.object({
  recordingEnabled: z.boolean().default(true),
  recordingStorageBackend: z.nativeEnum(PamRecordingStorageBackend).default(PamRecordingStorageBackend.Postgres),
  recordingS3Config: PamRecordingS3ConfigSchema.optional(),
  passwordConstraints: PamPasswordConstraintsSchema.optional(),
  sessionLogMaskingPatterns: patternsStringSchema().optional()
});

export type TPamTemplateSettings = z.infer<typeof PamTemplateSettingsSchema>;
export type TPamPasswordConstraints = z.infer<typeof PamPasswordConstraintsSchema>;
