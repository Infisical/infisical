import { z } from "zod";

import {
  SSHAccountCredentialsSchema,
  SSHAccountSchema,
  SSHResourceConnectionDetailsSchema,
  SSHResourceMetadataSchema,
  SSHResourceSchema
} from "./ssh-resource-schemas";

// Resources
export type TSSHResource = z.infer<typeof SSHResourceSchema>;
export type TSSHResourceConnectionDetails = z.infer<typeof SSHResourceConnectionDetailsSchema>;
export type TSSHResourceMetadata = z.infer<typeof SSHResourceMetadataSchema>;

// Accounts
export type TSSHAccount = z.infer<typeof SSHAccountSchema>;
export type TSSHAccountCredentials = z.infer<typeof SSHAccountCredentialsSchema>;
