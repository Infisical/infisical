import { z } from "zod";

import {
  ActiveDirectoryAccountCredentialsSchema,
  ActiveDirectoryAccountMetadataSchema,
  ActiveDirectoryConnectionDetailsSchema
} from "./active-directory-domain-schemas";

export type TActiveDirectoryConnectionDetails = z.infer<typeof ActiveDirectoryConnectionDetailsSchema>;

export type TActiveDirectoryAccountCredentials = z.infer<typeof ActiveDirectoryAccountCredentialsSchema>;
export type TActiveDirectoryAccountInternalMetadata = z.infer<typeof ActiveDirectoryAccountMetadataSchema>;
