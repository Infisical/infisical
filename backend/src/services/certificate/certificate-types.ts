import * as x509 from "@peculiar/x509";

import { TProjectPermission } from "@app/lib/types";

import { TKmsServiceFactory } from "../kms/kms-service";
import { TProjectDALFactory } from "../project/project-dal";
import { TCertificateSecretDALFactory } from "./certificate-secret-dal";

export enum CertStatus {
  ACTIVE = "active",
  EXPIRED = "expired",
  REVOKED = "revoked"
}

export enum CertKeyAlgorithm {
  RSA_2048 = "RSA_2048",
  RSA_3072 = "RSA_3072",
  RSA_4096 = "RSA_4096",
  ECDSA_P256 = "EC_prime256v1",
  ECDSA_P384 = "EC_secp384r1",
  ECDSA_P521 = "EC_secp521r1"
}

export enum CertKeyType {
  RSA = "RSA",
  ECDSA = "ECDSA"
}

export enum CertSignatureAlgorithm {
  RSA_SHA256 = "RSA-SHA256",
  RSA_SHA384 = "RSA-SHA384",
  RSA_SHA512 = "RSA-SHA512",
  ECDSA_SHA256 = "ECDSA-SHA256",
  ECDSA_SHA384 = "ECDSA-SHA384",
  ECDSA_SHA512 = "ECDSA-SHA512"
}

export enum CertKeyUsage {
  DIGITAL_SIGNATURE = "digitalSignature",
  KEY_ENCIPHERMENT = "keyEncipherment",
  NON_REPUDIATION = "nonRepudiation",
  DATA_ENCIPHERMENT = "dataEncipherment",
  KEY_AGREEMENT = "keyAgreement",
  KEY_CERT_SIGN = "keyCertSign",
  CRL_SIGN = "cRLSign",
  ENCIPHER_ONLY = "encipherOnly",
  DECIPHER_ONLY = "decipherOnly"
}

export enum CertExtendedKeyUsage {
  CLIENT_AUTH = "clientAuth",
  SERVER_AUTH = "serverAuth",
  CODE_SIGNING = "codeSigning",
  EMAIL_PROTECTION = "emailProtection",
  TIMESTAMPING = "timeStamping",
  OCSP_SIGNING = "ocspSigning"
}

export enum CertSignatureType {
  RSA = "RSA",
  ECDSA = "ECDSA"
}

export const CertExtendedKeyUsageOIDToName: Record<string, CertExtendedKeyUsage> = {
  [x509.ExtendedKeyUsage.clientAuth]: CertExtendedKeyUsage.CLIENT_AUTH,
  [x509.ExtendedKeyUsage.serverAuth]: CertExtendedKeyUsage.SERVER_AUTH,
  [x509.ExtendedKeyUsage.codeSigning]: CertExtendedKeyUsage.CODE_SIGNING,
  [x509.ExtendedKeyUsage.emailProtection]: CertExtendedKeyUsage.EMAIL_PROTECTION,
  [x509.ExtendedKeyUsage.ocspSigning]: CertExtendedKeyUsage.OCSP_SIGNING,
  [x509.ExtendedKeyUsage.timeStamping]: CertExtendedKeyUsage.TIMESTAMPING
};

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
  id?: string;
  serialNumber?: string;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteCertDTO = {
  id?: string;
  serialNumber?: string;
} & Omit<TProjectPermission, "projectId">;

export type TRevokeCertDTO = {
  id?: string;
  serialNumber?: string;
  revocationReason: CrlReason;
} & Omit<TProjectPermission, "projectId">;

export type TGetCertBodyDTO = {
  id?: string;
  serialNumber?: string;
} & Omit<TProjectPermission, "projectId">;

export type TImportCertDTO = {
  projectSlug: string;

  friendlyName?: string;
  pkiCollectionId?: string;

  certificatePem: string;
  privateKeyPem: string;
  chainPem: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetCertPrivateKeyDTO = {
  id?: string;
  serialNumber?: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetCertBundleDTO = {
  id?: string;
  serialNumber?: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetCertPkcs12DTO = {
  id?: string;
  serialNumber?: string;
  password: string;
  alias: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetCertificateCredentialsDTO = {
  certId: string;
  projectId: string;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "findOne">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "generateKmsKey">;
};

export enum CertSubjectAlternativeNameType {
  DNS_NAME = "dns_name",
  IP_ADDRESS = "ip_address",
  EMAIL = "email",
  URI = "uri"
}

export enum TAltNameType {
  EMAIL = "email",
  DNS = "dns",
  IP = "ip",
  URL = "url"
}

export const mapLegacyAltNameType = (legacyType: TAltNameType): CertSubjectAlternativeNameType => {
  switch (legacyType) {
    case TAltNameType.EMAIL:
      return CertSubjectAlternativeNameType.EMAIL;
    case TAltNameType.DNS:
      return CertSubjectAlternativeNameType.DNS_NAME;
    case TAltNameType.IP:
      return CertSubjectAlternativeNameType.IP_ADDRESS;
    case TAltNameType.URL:
      return CertSubjectAlternativeNameType.URI;
    default:
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw new Error(`Unknown legacy alt name type: ${legacyType}`);
  }
};
export type TAltNameMapping = {
  type: TAltNameType;
  value: string;
};

export enum ACMESANType {
  DNS = "dns",
  IP = "ip"
}

export enum CertificateOrderStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  VALID = "valid",
  INVALID = "invalid"
}
