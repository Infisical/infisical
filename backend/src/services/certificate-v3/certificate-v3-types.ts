import { TProjectPermission } from "@app/lib/types";

import { CertExtendedKeyUsage, CertKeyUsage } from "../certificate/certificate-types";

export type TIssueCertificateFromProfileDTO = {
  profileId: string;
  certificateRequest: {
    commonName?: string;
    keyUsages?: CertKeyUsage[];
    extendedKeyUsages?: CertExtendedKeyUsage[];
    subjectAlternativeNames?: Array<{
      type: "dns_name" | "ip_address" | "email" | "uri";
      value: string;
    }>;
    validity: {
      ttl: string;
    };
    notBefore?: Date;
    notAfter?: Date;
    signatureAlgorithm?: string;
    keyAlgorithm?: string;
  };
} & Omit<TProjectPermission, "projectId">;

export type TSignCertificateFromProfileDTO = {
  profileId: string;
  csr: string;
  validity: {
    ttl: string;
  };
  notBefore?: Date;
  notAfter?: Date;
} & Omit<TProjectPermission, "projectId">;

export type TOrderCertificateFromProfileDTO = {
  profileId: string;
  certificateOrder: {
    identifiers: Array<{
      type: "dns" | "ip";
      value: string;
    }>;
    validity: {
      ttl: string;
    };
    commonName?: string;
    keyUsages?: CertKeyUsage[];
    extendedKeyUsages?: CertExtendedKeyUsage[];
    notBefore?: Date;
    notAfter?: Date;
    signatureAlgorithm?: string;
    keyAlgorithm?: string;
  };
} & Omit<TProjectPermission, "projectId">;

export type TCertificateFromProfileResponse = {
  certificate: string;
  issuingCaCertificate: string;
  certificateChain: string;
  privateKey?: string;
  serialNumber: string;
  certificateId: string;
};

export type TCertificateOrderResponse = {
  orderId: string;
  status: "pending" | "processing" | "valid" | "invalid";
  identifiers: Array<{
    type: "dns" | "ip";
    value: string;
    status: "pending" | "processing" | "valid" | "invalid";
  }>;
  authorizations: Array<{
    identifier: {
      type: "dns" | "ip";
      value: string;
    };
    status: "pending" | "processing" | "valid" | "invalid";
    expires?: string;
    challenges: Array<{
      type: string;
      status: "pending" | "processing" | "valid" | "invalid";
      url: string;
      token: string;
    }>;
  }>;
  finalize: string;
  certificate?: string;
};
