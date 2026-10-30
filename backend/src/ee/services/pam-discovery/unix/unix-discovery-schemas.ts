import { z } from "zod";

import { DiscoveryTargetsSchema } from "../pam-discovery-targets";

export const UnixDiscoveryConfigSchema = z.object({
  cidrRanges: DiscoveryTargetsSchema,
  credentialAccountIds: z.array(z.string().uuid()).min(1).max(50)
});
