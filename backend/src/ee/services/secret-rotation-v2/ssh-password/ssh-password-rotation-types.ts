import { z } from "zod";

import { TSshConnection } from "@app/services/app-connection/ssh";

import {
  CreateSshPasswordRotationSchema,
  SshPasswordRotationGeneratedCredentialsSchema,
  SshPasswordRotationListItemSchema,
  SshPasswordRotationSchema
} from "./ssh-password-rotation-schemas";

export type TSshPasswordRotation = z.infer<typeof SshPasswordRotationSchema>;

export type TSshPasswordRotationInput = z.infer<typeof CreateSshPasswordRotationSchema>;

export type TSshPasswordRotationListItem = z.infer<typeof SshPasswordRotationListItemSchema>;

export type TSshPasswordRotationWithConnection = TSshPasswordRotation & {
  connection: TSshConnection;
};

export type TSshPasswordRotationGeneratedCredentials = z.infer<typeof SshPasswordRotationGeneratedCredentialsSchema>;
