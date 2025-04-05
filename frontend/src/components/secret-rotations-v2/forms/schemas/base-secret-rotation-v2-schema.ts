import { z } from "zod";

import { slugSchema } from "@app/lib/schemas";

export const BaseSecretRotationSchema = z.object({
  name: slugSchema({ field: "Name" }),
  description: z.string().trim().max(256, "Cannot exceed 256 characters").nullish(),
  connection: z.object({ name: z.string(), id: z.string().uuid() }),
  environment: z.object({ slug: z.string(), id: z.string(), name: z.string() }),
  secretPath: z.string().min(1, "Secret path required"),
  isAutoRotationEnabled: z.boolean(),
  rotationInterval: z.coerce.number(),
  rotateAtUtc: z.object({
    hours: z.number(),
    minutes: z.number()
  })
});
