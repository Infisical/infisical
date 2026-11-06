import { z } from "zod";

import { DiscoveryHostsSchema } from "../pam-discovery-targets";

export const PostgresDiscoveryConfigSchema = z.object({
  hosts: DiscoveryHostsSchema,
  credentialAccountIds: z.array(z.string().guid()).min(1).max(50)
});
