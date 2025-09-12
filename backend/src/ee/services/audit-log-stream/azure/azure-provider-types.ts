import { z } from "zod";

import { AzureProviderCredentialsSchema, AzureProviderSchema } from "./azure-provider-schemas";

export type TAzureProvider = z.infer<typeof AzureProviderSchema>;

export type TAzureProviderCredentials = z.infer<typeof AzureProviderCredentialsSchema>;
