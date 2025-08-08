import { z } from "zod";

import { TAzureCertificateConnection } from "@app/services/app-connection/azure-certificate";

import {
  AzureCertificateRotationGeneratedCredentialsSchema,
  AzureCertificateRotationListItemSchema,
  AzureCertificateRotationSchema,
  CreateAzureCertificateRotationSchema
} from "./azure-certificate-rotation-schemas";

export type TAzureCertificateRotation = z.infer<typeof AzureCertificateRotationSchema>;

export type TAzureCertificateRotationInput = z.infer<typeof CreateAzureCertificateRotationSchema>;

export type TAzureCertificateRotationListItem = z.infer<typeof AzureCertificateRotationListItemSchema>;

export type TAzureCertificateRotationWithConnection = TAzureCertificateRotation & {
  connection: TAzureCertificateConnection;
};

export type TAzureCertificateRotationGeneratedCredentials = z.infer<
  typeof AzureCertificateRotationGeneratedCredentialsSchema
>;

export interface TAzureCertificateRotationParameters {
  objectId: string;
  appName?: string;
  privateKey?: string;
  distinguishedName?: string;
  keyAlgorithm?: string;
  keyUsages?: string[];
}

export interface TAzureCertificateRotationSecretsMapping {
  publicKey: string;
  privateKey: string;
}

// Enhanced interfaces for certificate management
export interface CertificateData {
  publicKey: string;
  privateKey: string;
  thumbprint: string;
  keyId?: string;
  notAfter?: Date;
  notBefore?: Date;
}

export interface AzureCertificateInfo {
  keyId: string;
  type: string;
  usage: string;
  endDateTime: string;
  startDateTime?: string;
  displayName?: string;
  thumbprint?: string;
  key?: string;
  customKeyIdentifier?: string;
}
