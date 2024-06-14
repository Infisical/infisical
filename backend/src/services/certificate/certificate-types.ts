import { TProjectPermission } from "@app/lib/types";

export enum CertStatus {
  ACTIVE = "active",
  REVOKED = "revoked"
}

export enum CertKeyAlgorithm {
  RSA_2048 = "RSA_2048",
  RSA_4096 = "RSA_4096",
  ECDSA_P256 = "EC_prime256v1",
  ECDSA_P384 = "EC_secp384r1"
}

export enum CrlReason {
  UNSPECIFIED = "UNSPECIFIED",
  KEY_COMPROMISE = "KEY_COMPROMISE",
  CA_COMPROMISE = "CA_COMPROMISE",
  AFFILIATION_CHANGED = "AFFILIATION_CHANGED",
  SUPERSEDED = "SUPERSEDED",
  CESSATION_OF_OPERATION = "CESSATION_OF_OPERATION",
  CERTIFICATE_HOLD = "CERTIFICATE_HOLD",
  // REMOVE_FROM_CRL = "REMOVE_FROM_CRL",
  PRIVILEGE_WITHDRAWN = "PRIVILEGE_WITHDRAWN",
  A_A_COMPROMISE = "A_A_COMPROMISE"
}

export type TGetCertDTO = {
  serialNumber: string;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteCertDTO = {
  serialNumber: string;
} & Omit<TProjectPermission, "projectId">;

export type TRevokeCertDTO = {
  serialNumber: string;
  revocationReason: CrlReason;
} & Omit<TProjectPermission, "projectId">;

export type TGetCertBodyDTO = {
  serialNumber: string;
} & Omit<TProjectPermission, "projectId">;
