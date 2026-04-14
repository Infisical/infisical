import { z } from "zod";

import {
  ActiveDirectoryDiscoveryConfigurationSchema,
  ActiveDirectoryDiscoveryCredentialsSchema,
  ActiveDirectoryDiscoverySourceRunProgressSchema,
  ActiveDirectoryDiscoverySourceSchema
} from "./active-directory-discovery-schemas";

export type TActiveDirectoryDiscoverySource = z.infer<typeof ActiveDirectoryDiscoverySourceSchema>;
export type TActiveDirectoryDiscoverySourceCredentials = z.infer<typeof ActiveDirectoryDiscoveryCredentialsSchema>;
export type TActiveDirectoryDiscoverySourceConfiguration = z.infer<typeof ActiveDirectoryDiscoveryConfigurationSchema>;
export type TActiveDirectoryDiscoverySourceRunProgress = z.infer<
  typeof ActiveDirectoryDiscoverySourceRunProgressSchema
>;
