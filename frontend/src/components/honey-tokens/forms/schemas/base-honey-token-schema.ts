import { z } from "zod";

import { slugSchema } from "@app/lib/schemas";

export const BaseHoneyTokenSchema = z.object({
  name: slugSchema({ field: "Name" }),
  description: z.string().trim().max(256, "Cannot exceed 256 characters").nullish(),
  environment: z.object({ slug: z.string(), id: z.string(), name: z.string() }),
  secretPath: z.string().min(1, "Secret path required")
});
