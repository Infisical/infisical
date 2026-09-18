import { z } from "zod";

import { SumoLogicProviderCredentialsSchema, SumoLogicProviderSchema } from "./sumo-logic-provider-schemas";

export type TSumoLogicProvider = z.infer<typeof SumoLogicProviderSchema>;

export type TSumoLogicProviderCredentials = z.infer<typeof SumoLogicProviderCredentialsSchema>;
