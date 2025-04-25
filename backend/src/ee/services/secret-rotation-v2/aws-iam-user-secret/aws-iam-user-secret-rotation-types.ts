import { z } from "zod";

import { TAwsConnection } from "@app/services/app-connection/aws";

import {
  AwsIamUserSecretRotationGeneratedCredentialsSchema,
  AwsIamUserSecretRotationListItemSchema,
  AwsIamUserSecretRotationSchema,
  CreateAwsIamUserSecretRotationSchema
} from "./aws-iam-user-secret-rotation-schemas";

export type TAwsIamUserSecretRotation = z.infer<typeof AwsIamUserSecretRotationSchema>;

export type TAwsIamUserSecretRotationInput = z.infer<typeof CreateAwsIamUserSecretRotationSchema>;

export type TAwsIamUserSecretRotationListItem = z.infer<typeof AwsIamUserSecretRotationListItemSchema>;

export type TAwsIamUserSecretRotationWithConnection = TAwsIamUserSecretRotation & {
  connection: TAwsConnection;
};

export type TAwsIamUserSecretRotationGeneratedCredentials = z.infer<
  typeof AwsIamUserSecretRotationGeneratedCredentialsSchema
>;
