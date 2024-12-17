import { AppConnectionsSchema } from "@app/db/schemas/app-connections";

export const BaseAppConnectionSchema = AppConnectionsSchema.omit({
  encryptedCredentials: true,
  app: true,
  method: true
});
