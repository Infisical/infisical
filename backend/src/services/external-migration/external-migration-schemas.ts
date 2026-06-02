import { z } from "zod";

export enum ExternalMigrationProviders {
  Vault = "vault",
  EnvKey = "env-key",
  Doppler = "doppler"
}

export const ExternalMigrationConfigVaultConfigSchema = z.object({
  namespace: z.string()
});
