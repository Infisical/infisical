import { z } from "zod";

import { TGcpConnection } from "@app/services/app-connection/gcp";

import {
  CreateGcpServiceAccountKeyRotationSchema,
  GcpServiceAccountKeyRotationGeneratedCredentialsSchema,
  GcpServiceAccountKeyRotationListItemSchema,
  GcpServiceAccountKeyRotationSchema
} from "./gcp-service-account-key-rotation-schemas";

export type TGcpServiceAccountKeyRotation = z.infer<typeof GcpServiceAccountKeyRotationSchema>;

export type TGcpServiceAccountKeyRotationInput = z.infer<typeof CreateGcpServiceAccountKeyRotationSchema>;

export type TGcpServiceAccountKeyRotationListItem = z.infer<typeof GcpServiceAccountKeyRotationListItemSchema>;

export type TGcpServiceAccountKeyRotationWithConnection = TGcpServiceAccountKeyRotation & {
  connection: TGcpConnection;
};

export type TGcpServiceAccountKeyRotationGeneratedCredentials = z.infer<
  typeof GcpServiceAccountKeyRotationGeneratedCredentialsSchema
>;

export type TGcpServiceAccountKeyCreateResponse = {
  // projects/{projectId}/serviceAccounts/{email}/keys/{keyId}
  name?: string;
  // base64 of the JSON key file
  privateKeyData?: string;
};

export type TGcpServiceAccountKeyFile = {
  client_email: string;
  private_key: string;
};
