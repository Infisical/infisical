import { z } from "zod";

import { HoneyTokenType } from "@app/hooks/api/honeyTokens/enums";

import { BaseHoneyTokenSchema } from "./base-honey-token-schema";

export const AwsHoneyTokenSchema = z
  .object({
    type: z.literal(HoneyTokenType.AWS),
    secretsMapping: z.object({
      accessKeyId: z.string().trim().min(1, "Access Key ID secret name required"),
      secretAccessKey: z.string().trim().min(1, "Secret Access Key secret name required")
    })
  })
  .merge(BaseHoneyTokenSchema);
