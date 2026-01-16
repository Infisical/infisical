export type TCertificatePolicyRule = {
  subject?: Array<{
    type: "common_name" | "organization" | "country" | "state" | "locality" | "organizational_unit";
    allowed?: string[];
    required?: string[];
    denied?: string[];
  }>;
  sans?: Array<{
    type: "dns_name" | "ip_address" | "email" | "uri";
    allowed?: string[];
    required?: string[];
    denied?: string[];
  }>;
  keyUsages?: {
    allowed?: string[];
    required?: string[];
    denied?: string[];
  };
  extendedKeyUsages?: {
    allowed?: string[];
    required?: string[];
    denied?: string[];
  };
  algorithms?: {
    signature?: Array<
      "SHA256-RSA" | "SHA384-RSA" | "SHA512-RSA" | "SHA256-ECDSA" | "SHA384-ECDSA" | "SHA512-ECDSA"
    >;
    keyAlgorithm?: Array<"RSA-2048" | "RSA-3072" | "RSA-4096" | "ECDSA-P256" | "ECDSA-P384">;
  };
  validity?: {
    max?: string;
  };
  basicConstraints?: TBasicConstraints;
};

import { CertPolicyState } from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

export type TBasicConstraintsIsCAPolicy = CertPolicyState;

export type TBasicConstraints = {
  isCA?: TBasicConstraintsIsCAPolicy;
  maxPathLength?: number;
} | null;

export type TCertificatePolicy = {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  subject?: TCertificatePolicyRule["subject"];
  sans?: TCertificatePolicyRule["sans"];
  keyUsages?: TCertificatePolicyRule["keyUsages"];
  extendedKeyUsages?: TCertificatePolicyRule["extendedKeyUsages"];
  algorithms?: TCertificatePolicyRule["algorithms"];
  validity?: TCertificatePolicyRule["validity"];
  createdAt: string;
  updatedAt: string;
  basicConstraints?: TBasicConstraints | null;
};

export type TCreateCertificatePolicyDTO = {
  projectId: string;
  name: string;
  description?: string;
  subject?: TCertificatePolicyRule["subject"];
  sans?: TCertificatePolicyRule["sans"];
  keyUsages?: TCertificatePolicyRule["keyUsages"];
  extendedKeyUsages?: TCertificatePolicyRule["extendedKeyUsages"];
  algorithms?: TCertificatePolicyRule["algorithms"];
  validity?: TCertificatePolicyRule["validity"];
  basicConstraints?: TBasicConstraints;
};

export type TUpdateCertificatePolicyDTO = {
  policyId: string;
  name?: string;
  description?: string;
  subject?: TCertificatePolicyRule["subject"];
  sans?: TCertificatePolicyRule["sans"];
  keyUsages?: TCertificatePolicyRule["keyUsages"];
  extendedKeyUsages?: TCertificatePolicyRule["extendedKeyUsages"];
  algorithms?: TCertificatePolicyRule["algorithms"];
  validity?: TCertificatePolicyRule["validity"];
  basicConstraints?: TBasicConstraints;
};

export type TDeleteCertificatePolicyDTO = {
  policyId: string;
};

export type TListCertificatePoliciesDTO = {
  projectId: string;
  limit?: number;
  offset?: number;
};

export type TGetCertificatePolicyByIdDTO = {
  policyId: string;
};
