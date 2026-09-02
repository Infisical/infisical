import {
  CertExtensionCriticality,
  CertExtensionRuleKind,
  CertPolicyState
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

/**
 * A domain_component rule's values are comma-joined ordered sequences ("corp,example,com"), one per
 * entry. Every other attribute type takes plain patterns.
 */
export type TSubjectRule = {
  type:
    | "common_name"
    | "organization"
    | "country"
    | "state"
    | "locality"
    | "organizational_unit"
    | "domain_component";
  allowed?: string[];
  required?: string[];
  denied?: string[];
};

export type TCustomExtensionRule = {
  oid: string;
  label?: string;
  critical?: CertExtensionCriticality;
  rule: CertExtensionRuleKind;
  value: string;
};

export type TCertificatePolicyRule = {
  subject?: TSubjectRule[];
  sans?: Array<{
    type: "dns_name" | "ip_address" | "email" | "uri" | "upn";
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
      | "SHA256-RSA"
      | "SHA384-RSA"
      | "SHA512-RSA"
      | "SHA256-ECDSA"
      | "SHA384-ECDSA"
      | "SHA512-ECDSA"
      | "ML-DSA-44"
      | "ML-DSA-65"
      | "ML-DSA-87"
    >;
    keyAlgorithm?: Array<
      | "RSA-2048"
      | "RSA-3072"
      | "RSA-4096"
      | "ECDSA-P256"
      | "ECDSA-P384"
      | "ECDSA-P521"
      | "ML-DSA-44"
      | "ML-DSA-65"
      | "ML-DSA-87"
    >;
  };
  validity?: {
    max?: string;
  };
  basicConstraints?: TBasicConstraints;
  customExtensions?: TCustomExtensionRule[];
};

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
  customExtensions?: TCustomExtensionRule[] | null;
};

export type TCreateCertificatePolicyDTO = {
  projectId?: string;
  name: string;
  description?: string;
  subject?: TCertificatePolicyRule["subject"] | null;
  sans?: TCertificatePolicyRule["sans"] | null;
  keyUsages?: TCertificatePolicyRule["keyUsages"] | null;
  extendedKeyUsages?: TCertificatePolicyRule["extendedKeyUsages"] | null;
  algorithms?: TCertificatePolicyRule["algorithms"] | null;
  validity?: TCertificatePolicyRule["validity"] | null;
  basicConstraints?: TBasicConstraints | null;
  customExtensions?: TCustomExtensionRule[] | null;
};

export type TUpdateCertificatePolicyDTO = {
  policyId: string;
  name?: string;
  description?: string;
  subject?: TCertificatePolicyRule["subject"] | null;
  sans?: TCertificatePolicyRule["sans"] | null;
  keyUsages?: TCertificatePolicyRule["keyUsages"] | null;
  extendedKeyUsages?: TCertificatePolicyRule["extendedKeyUsages"] | null;
  algorithms?: TCertificatePolicyRule["algorithms"] | null;
  validity?: TCertificatePolicyRule["validity"] | null;
  basicConstraints?: TBasicConstraints | null;
  customExtensions?: TCustomExtensionRule[] | null;
};

export type TDeleteCertificatePolicyDTO = {
  policyId: string;
};

export type TListCertificatePoliciesDTO = {
  limit?: number;
  offset?: number;
};

export type TGetCertificatePolicyByIdDTO = {
  policyId: string;
  applicationId?: string;
};
