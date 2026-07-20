import { z } from "zod";

export const ActiveDirectoryDiscoveryConfigSchema = z.object({
  scanLocalAccounts: z.boolean().default(true),
  winrmPort: z.coerce.number().int().min(1).max(65535).default(5985),
  useWinrmHttps: z.boolean().default(false),
  winrmRejectUnauthorized: z.boolean().default(true),
  winrmCaCert: z.string().trim().optional()
});
