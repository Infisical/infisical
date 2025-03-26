import { z } from "zod";

import { SecretScanningResolvedStatus } from "@app/hooks/api/secretScanning/types";

export const secretScanningFilterFormSchema = z.object({
  repositoryNames: z.array(z.object({ name: z.string() })),
  resolved: z
    .nativeEnum(SecretScanningResolvedStatus)
    .default(SecretScanningResolvedStatus.All)
    .optional()
});

export type SecretScanningFilterFormData = z.infer<typeof secretScanningFilterFormSchema>;

export type SetValueType = (
  name: keyof SecretScanningFilterFormData,
  value: any,
  options?: {
    shouldValidate?: boolean;
    shouldDirty?: boolean;
  }
) => void;
