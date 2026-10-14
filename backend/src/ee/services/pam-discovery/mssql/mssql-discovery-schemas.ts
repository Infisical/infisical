import { z } from "zod";

import { DiscoveryHostsSchema } from "../pam-discovery-targets";

export const MsSqlDiscoveryConfigSchema = z.object({
  hosts: DiscoveryHostsSchema,
  credentialAccountIds: z.array(z.string().uuid()).min(1).max(50)
});
