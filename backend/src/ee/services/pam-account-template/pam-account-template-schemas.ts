import { z } from "zod";

import { PasswordRequirementsSchema } from "@app/ee/services/secret-rotation-v2/shared/general/password-requirements-schema";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";

import { patternsStringSchema } from "../pam/pam-policies";
import { PamRecordingStorageBackend } from "../pam-session-recording/pam-recording-enums";

export const PamRotationConfigSchema = z.object({
  enabled: z.boolean(),
  intervalSeconds: z.number().int().min(3600).max(31_536_000).nullable() // 1 hour .. 1 year, or null for manual
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
  passwordRequirements: PasswordRequirementsSchema.optional(),
  rotation: PamRotationConfigSchema.optional(),
  sessionLogMaskingPatterns: z.string().optional()
});

export const PamTemplateSettingsInputSchema = PamTemplateSettingsSchema.extend({
  sessionLogMaskingPatterns: patternsStringSchema().optional()
});

export type TPamTemplateSettings = z.infer<typeof PamTemplateSettingsSchema>;
export type TPamAccountSettingsOverrides = z.infer<typeof PamAccountSettingsOverridesSchema>;
export type TPamRotationConfig = z.infer<typeof PamRotationConfigSchema>;
