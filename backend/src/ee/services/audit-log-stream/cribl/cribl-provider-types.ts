import { z } from "zod";

import { CriblProviderCredentialsSchema, CriblProviderSchema } from "./cribl-provider-schemas";

export type TCriblProvider = z.infer<typeof CriblProviderSchema>;

export type TCriblProviderCredentials = z.infer<typeof CriblProviderCredentialsSchema>;
