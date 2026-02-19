import { z } from "zod";

import {
  ActiveDirectoryDiscoveryConfigurationSchema,
  ActiveDirectoryDiscoveryCredentialsSchema,
  ActiveDirectoryDiscoverySourceSchema
} from "./active-directory-discovery-schemas";

export type TActiveDirectoryDiscoverySource = z.infer<typeof ActiveDirectoryDiscoverySourceSchema>;
export type TActiveDirectoryDiscoveryCredentials = z.infer<typeof ActiveDirectoryDiscoveryCredentialsSchema>;
export type TActiveDirectoryDiscoveryConfiguration = z.infer<typeof ActiveDirectoryDiscoveryConfigurationSchema>;
