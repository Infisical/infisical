import { z } from "zod";

import { EndpointDeviceScansSchema, EndpointSecretFindingsSchema } from "@app/db/schemas";

import { EndpointScanTrigger, EndpointSecretFindingStatus } from "./endpoint-scan-enums";

export const EndpointScanPolicyResponseSchema = z.object({
  isEnabled: z.boolean(),
  roots: z.string().array(),
  excludePatterns: z.string().array(),
  maxFileMegabytes: z.number().nullable(),
  intervalHours: z.number()
});

// The generated schema types the jsonb columns as unknown, so they are narrowed here rather than in
// every route that returns a scan.
export const SanitizedEndpointDeviceScanSchema = EndpointDeviceScansSchema.omit({
  inaccessibleRoots: true,
  rootsScanned: true
}).extend({
  deviceName: z.string(),
  lastTrigger: z.nativeEnum(EndpointScanTrigger).nullable().optional(),
  rootsScanned: z.string().array().nullable().optional(),
  inaccessibleRoots: z.string().array().nullable().optional()
});

export const SanitizedEndpointSecretFindingSchema = EndpointSecretFindingsSchema.extend({
  deviceName: z.string(),
  status: z.nativeEnum(EndpointSecretFindingStatus)
});
