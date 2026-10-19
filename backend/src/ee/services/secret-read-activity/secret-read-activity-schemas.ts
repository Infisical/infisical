import { z } from "zod";

import { SECRET_EXPOSURE } from "@app/lib/api-docs";

import { SecretExposureBand, SecretExposureDriver } from "./secret-read-activity-types";

export const SecretExposureSchema = z.object({
  score: z.number().int().min(0).max(100).describe(SECRET_EXPOSURE.score),
  band: z.nativeEnum(SecretExposureBand).describe(SECRET_EXPOSURE.band),
  drivers: z
    .object({
      kind: z.nativeEnum(SecretExposureDriver).describe(SECRET_EXPOSURE.driverKind),
      points: z.number().int().describe(SECRET_EXPOSURE.driverPoints),
      label: z.string().describe(SECRET_EXPOSURE.driverLabel)
    })
    .array()
    .describe(SECRET_EXPOSURE.drivers)
});

export const SecretExposureCountsSchema = z.object({
  entitledCount: z.number().int().describe(SECRET_EXPOSURE.entitledCount),
  unreadCount: z.number().int().describe(SECRET_EXPOSURE.unreadCount),
  ghostReaderCount: z.number().int().describe(SECRET_EXPOSURE.ghostReaderCount)
});
