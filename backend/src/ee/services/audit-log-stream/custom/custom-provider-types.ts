import { z } from "zod";

import { CustomProviderCredentialsSchema, CustomProviderSchema } from "./custom-provider-schemas";

export type TCustomProvider = z.infer<typeof CustomProviderSchema>;

export type TCustomProviderCredentials = z.infer<typeof CustomProviderCredentialsSchema>;
