import { z } from "zod";

import { slugSchema } from "@app/lib/schemas";

type SchemaOptions = {
  isConnectionRequired: boolean;
};

export const BaseSecretScanningDataSourceSchema = ({ isConnectionRequired }: SchemaOptions) =>
  z.object({
    name: slugSchema({ field: "Name" }),
    description: z.string().trim().max(256, "Cannot exceed 256 characters").nullish(),
    connection: isConnectionRequired
      ? z.object({ name: z.string(), id: z.string().uuid() })
      : z.null().or(z.undefined()),
    isAutoScanEnabled: z.boolean(),
    id: z.string().uuid().optional()
  });
