import { z } from "zod";

import { SplunkProviderCredentialsSchema, SplunkProviderSchema } from "./splunk-provider-schemas";

export type TSplunkProvider = z.infer<typeof SplunkProviderSchema>;

export type TSplunkProviderCredentials = z.infer<typeof SplunkProviderCredentialsSchema>;
