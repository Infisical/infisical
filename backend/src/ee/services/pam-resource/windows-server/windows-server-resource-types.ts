import { z } from "zod";

import {
  WindowsAccountCredentialsSchema,
  WindowsAccountMetadataSchema,
  WindowsAccountSchema,
  WindowsResourceConnectionDetailsSchema,
  WindowsResourceMetadataSchema,
  WindowsResourceSchema
} from "./windows-server-resource-schemas";

// Resources
export type TWindowsResource = z.infer<typeof WindowsResourceSchema>;
export type TWindowsResourceConnectionDetails = z.infer<typeof WindowsResourceConnectionDetailsSchema>;
export type TWindowsResourceMetadata = z.infer<typeof WindowsResourceMetadataSchema>;

// Accounts
export type TWindowsAccount = z.infer<typeof WindowsAccountSchema>;
export type TWindowsAccountCredentials = z.infer<typeof WindowsAccountCredentialsSchema>;
export type TWindowsAccountMetadata = z.infer<typeof WindowsAccountMetadataSchema>;
