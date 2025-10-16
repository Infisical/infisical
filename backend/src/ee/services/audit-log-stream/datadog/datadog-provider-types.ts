import { z } from "zod";

import { DatadogProviderCredentialsSchema, DatadogProviderSchema } from "./datadog-provider-schemas";

export type TDatadogProvider = z.infer<typeof DatadogProviderSchema>;

export type TDatadogProviderCredentials = z.infer<typeof DatadogProviderCredentialsSchema>;
