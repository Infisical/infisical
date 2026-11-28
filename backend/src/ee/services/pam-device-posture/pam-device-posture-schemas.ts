import RE2 from "re2";
import { z } from "zod";

import {
  PAM_DEVICE_POSTURE_MAX_CHECK_IN_HOURS,
  PamDevicePlatform,
  PamDevicePostureCheck,
  PamDevicePostureProvider,
  PamDeviceVerificationStatus
} from "./pam-device-posture-enums";

const VERSION_PATTERN = new RE2("^\\d+(\\.\\d+){0,3}$");

const MinimumVersionSchema = z
  .string()
  .trim()
  .max(32)
  .refine((value) => !value || VERSION_PATTERN.test(value), {
    message: "Use a version like 15.0 or 10.0.22631"
  })
  .optional()
  .transform((value) => value || undefined);

export const PamRipplingPostureProviderSchema = z.object({
  provider: z.literal(PamDevicePostureProvider.Rippling),
  connectionId: z.string().uuid({ message: "Choose a connection for each device posture provider" }),
  checks: z.object({
    [PamDevicePostureCheck.DiskEncrypted]: z.boolean().default(false),
    [PamDevicePostureCheck.NoPendingOsUpdate]: z.boolean().default(false),
    [PamDevicePostureCheck.MinimumOsVersion]: z
      .object({ macos: MinimumVersionSchema, windows: MinimumVersionSchema })
      .nullable()
      .default(null)
      .transform((value) => (value && (value.macos || value.windows) ? value : null)),
    [PamDevicePostureCheck.RecentCheckIn]: z
      .object({ maxHours: z.number().int().min(1).max(PAM_DEVICE_POSTURE_MAX_CHECK_IN_HOURS) })
      .nullable()
      .default(null)
  })
});

export const PamDevicePostureProviderConfigSchema = z.discriminatedUnion("provider", [
  PamRipplingPostureProviderSchema
]);

export const PamDevicePosturePolicySchema = z.object({
  providers: z
    .array(PamDevicePostureProviderConfigSchema)
    .min(1, "Add at least one device posture provider")
    .max(Object.values(PamDevicePostureProvider).length)
    .refine((providers) => new Set(providers.map((p) => p.provider)).size === providers.length, {
      message: "Each device posture provider can be added once"
    })
});

export type TPamRipplingPostureProvider = z.infer<typeof PamRipplingPostureProviderSchema>;
export type TPamDevicePostureProviderConfig = z.infer<typeof PamDevicePostureProviderConfigSchema>;
export type TPamDevicePosturePolicy = z.infer<typeof PamDevicePosturePolicySchema>;

export const PamDeviceInfoSchema = z.object({
  serialNumber: z.string().trim().min(1).max(128),
  platform: z.nativeEnum(PamDevicePlatform),
  model: z.string().trim().max(256).optional(),
  osName: z.string().trim().max(128).optional(),
  osVersion: z.string().trim().max(64).optional(),
  hostname: z.string().trim().max(256).optional()
});

export type TPamDeviceInfo = z.infer<typeof PamDeviceInfoSchema>;

export const PamDevicePostureCheckResultSchema = z.object({
  provider: z.string(),
  check: z.nativeEnum(PamDevicePostureCheck),
  label: z.string(),
  passed: z.boolean(),
  detail: z.string()
});

export type TPamDevicePostureCheckResult = z.infer<typeof PamDevicePostureCheckResultSchema>;

export const PamDeviceVerificationResponseSchema = z.object({
  id: z.string().uuid(),
  status: z.nativeEnum(PamDeviceVerificationStatus),
  message: z.string().nullable().optional(),
  accountName: z.string().optional(),
  providers: z.array(z.string()).optional(),
  device: z
    .object({ serial: z.string(), model: z.string().nullable(), os: z.string().nullable() })
    .nullable()
    .optional(),
  checks: z.array(PamDevicePostureCheckResultSchema).optional()
});

export type TPamDeviceVerificationResponse = z.infer<typeof PamDeviceVerificationResponseSchema>;
