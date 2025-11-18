import { z } from "zod";

import {
  SSHAccountCredentialsSchema,
  SSHAccountSchema,
  SSHResourceConnectionDetailsSchema,
  SSHResourceSchema
} from "./ssh-resource-schemas";

// Resources
export type TSSHResource = z.infer<typeof SSHResourceSchema>;
export type TSSHResourceConnectionDetails = z.infer<typeof SSHResourceConnectionDetailsSchema>;

// Accounts
export type TSSHAccount = z.infer<typeof SSHAccountSchema>;
export type TSSHAccountCredentials = z.infer<typeof SSHAccountCredentialsSchema>;
