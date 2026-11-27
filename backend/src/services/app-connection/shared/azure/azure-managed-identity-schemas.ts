import { z } from "zod";

export const AzureConnectionFederatedCredentialSchema = z
  .object({
    issuerUrl: z.string().nullable(),
    subjectIdentifier: z.string(),
    audience: z.string()
  })
  .describe(
    "The values to add to a federated credential on the managed identity. The issuer is null when SITE_URL is not set."
  );
