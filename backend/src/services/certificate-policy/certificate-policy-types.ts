import { TPkiCertificatePolicies, TPkiCertificatePoliciesInsert } from "@app/db/schemas/pki-certificate-policies";
import {
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType
} from "@app/services/certificate-common/certificate-constants";

export interface TTemplateV2Policy {
  subject?: Array<{
    type: CertSubjectAttributeType;
    allowed?: string[];
    required?: string[];
    denied?: string[];
  }>;
  sans?: Array<{
    type: CertSubjectAlternativeNameType;
    allowed?: string[];
    required?: string[];
    denied?: string[];
  }>;
  keyUsages?: {
    allowed?: CertKeyUsageType[];
    required?: CertKeyUsageType[];
    denied?: CertKeyUsageType[];
  };
  extendedKeyUsages?: {
    allowed?: CertExtendedKeyUsageType[];
    required?: CertExtendedKeyUsageType[];
    denied?: CertExtendedKeyUsageType[];
  };
  algorithms?: {
    signature?: string[];
    keyAlgorithm?: string[];
  };
  validity?: {
    max?: string;
  };
}

export type TCertificatePolicy = TPkiCertificatePolicies & {
  subject?: TTemplateV2Policy["subject"];
  sans?: TTemplateV2Policy["sans"];
  keyUsages?: TTemplateV2Policy["keyUsages"];
  extendedKeyUsages?: TTemplateV2Policy["extendedKeyUsages"];
  algorithms?: TTemplateV2Policy["algorithms"];
  validity?: TTemplateV2Policy["validity"];
};

export type TCertificatePolicyInsert = TPkiCertificatePoliciesInsert & {
  subject?: TTemplateV2Policy["subject"];
  sans?: TTemplateV2Policy["sans"];
  keyUsages?: TTemplateV2Policy["keyUsages"];
  extendedKeyUsages?: TTemplateV2Policy["extendedKeyUsages"];
  algorithms?: TTemplateV2Policy["algorithms"];
  validity?: TTemplateV2Policy["validity"];
};

export type TCertificatePolicyUpdate = Partial<
  Pick<
    TCertificatePolicy,
    "name" | "description" | "subject" | "sans" | "keyUsages" | "extendedKeyUsages" | "algorithms" | "validity"
  >
>;

export interface TCertificateRequest {
  commonName?: string;
  organization?: string;
  organizationUnit?: string;
  locality?: string;
  state?: string;
  country?: string;
  email?: string;
  streetAddress?: string;
  postalCode?: string;
  keyUsages?: CertKeyUsageType[];
  extendedKeyUsages?: CertExtendedKeyUsageType[];
  subjectAlternativeNames?: Array<{
    type: CertSubjectAlternativeNameType;
    value: string;
  }>;
  validity?: {
    ttl: string;
  };
  notBefore?: Date;
  notAfter?: Date;
  signatureAlgorithm?: string;
  keyAlgorithm?: string;
}

export interface TPolicyValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}
