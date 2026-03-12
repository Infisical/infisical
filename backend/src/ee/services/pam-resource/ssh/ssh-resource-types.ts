import { z } from "zod";

import {
  SSHAccountCredentialsSchema,
  SSHAccountSchema,
  SSHResourceConnectionDetailsSchema,
  SSHResourceInternalMetadataSchema,
  SSHResourceSchema
} from "./ssh-resource-schemas";

// Resources
export type TSSHResource = z.infer<typeof SSHResourceSchema>;
export type TSSHResourceConnectionDetails = z.infer<typeof SSHResourceConnectionDetailsSchema>;
export type TSSHResourceInternalMetadata = z.infer<typeof SSHResourceInternalMetadataSchema>;

// Accounts
export type TSSHAccount = z.infer<typeof SSHAccountSchema>;
export type TSSHAccountCredentials = z.infer<typeof SSHAccountCredentialsSchema>;
