import { z } from "zod";

import {
  ActiveDirectoryAccountCredentialsSchema,
  ActiveDirectoryAccountMetadataSchema,
  ActiveDirectoryAccountSchema,
  ActiveDirectoryResourceConnectionDetailsSchema,
  ActiveDirectoryResourceSchema
} from "./active-directory-resource-schemas";

// Resources
export type TActiveDirectoryResource = z.infer<typeof ActiveDirectoryResourceSchema>;
export type TActiveDirectoryResourceConnectionDetails = z.infer<typeof ActiveDirectoryResourceConnectionDetailsSchema>;

// Accounts
export type TActiveDirectoryAccount = z.infer<typeof ActiveDirectoryAccountSchema>;
export type TActiveDirectoryAccountCredentials = z.infer<typeof ActiveDirectoryAccountCredentialsSchema>;
export type TActiveDirectoryAccountMetadata = z.infer<typeof ActiveDirectoryAccountMetadataSchema>;
