import { z } from "zod";

export enum ExternalMigrationProviders {
  Vault = "vault",
  EnvKey = "env-key",
  Doppler = "doppler"
}

export const ExternalMigrationConfigVaultConfigSchema = z.object({
  namespace: z.string()
});

export const ExternalMigrationConfigDopplerConfigSchema = z.object({});

export const ExternalMigrationConfigSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal(ExternalMigrationProviders.Vault),
    config: ExternalMigrationConfigVaultConfigSchema
  }),
  z.object({
    provider: z.literal(ExternalMigrationProviders.Doppler),
    config: ExternalMigrationConfigDopplerConfigSchema
  })
]);

export type TExternalMigrationConfig = z.infer<typeof ExternalMigrationConfigSchema>;
