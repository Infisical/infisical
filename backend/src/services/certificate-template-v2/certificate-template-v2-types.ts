import { TCertificateTemplatesV2, TCertificateTemplatesV2Insert } from "@app/db/schemas/certificate-templates-v2";
import {
  CertDurationUnit,
  CertExtendedKeyUsageType,
  CertIncludeType,
  CertKeyUsageType,
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType
} from "@app/services/certificate-common/certificate-constants";

export interface TTemplateV2Policy {
  attributes: Array<{
    type: CertSubjectAttributeType;
    include: CertIncludeType;
    value?: string[];
  }>;
  keyUsages: {
    requiredUsages?: { all: CertKeyUsageType[] };
    optionalUsages?: { all: CertKeyUsageType[] };
  };
  extendedKeyUsages: {
    requiredUsages?: { all: CertExtendedKeyUsageType[] };
    optionalUsages?: { all: CertExtendedKeyUsageType[] };
  };
  subjectAlternativeNames: Array<{
    type: CertSubjectAlternativeNameType;
    include: CertIncludeType;
    value?: string[];
  }>;
  validity: {
    maxDuration: { value: number; unit: CertDurationUnit };
    minDuration?: { value: number; unit: CertDurationUnit };
  };
  signatureAlgorithm: {
    allowedAlgorithms: string[];
    defaultAlgorithm: string;
  };
  keyAlgorithm: {
    allowedKeyTypes: string[];
    defaultKeyType: string;
  };
}

export type TCertificateTemplateV2 = Omit<
  TCertificateTemplatesV2,
  | "attributes"
  | "keyUsages"
  | "extendedKeyUsages"
  | "subjectAlternativeNames"
  | "validity"
  | "signatureAlgorithm"
  | "keyAlgorithm"
> & {
  attributes: TTemplateV2Policy["attributes"];
  keyUsages: TTemplateV2Policy["keyUsages"];
  extendedKeyUsages: TTemplateV2Policy["extendedKeyUsages"];
  subjectAlternativeNames: TTemplateV2Policy["subjectAlternativeNames"];
  validity: TTemplateV2Policy["validity"];
  signatureAlgorithm: TTemplateV2Policy["signatureAlgorithm"];
  keyAlgorithm: TTemplateV2Policy["keyAlgorithm"];
};

export type TCertificateTemplateV2Insert = Omit<
  TCertificateTemplatesV2Insert,
  | "attributes"
  | "keyUsages"
  | "extendedKeyUsages"
  | "subjectAlternativeNames"
  | "validity"
  | "signatureAlgorithm"
  | "keyAlgorithm"
> & {
  attributes?: TTemplateV2Policy["attributes"];
  keyUsages?: TTemplateV2Policy["keyUsages"];
  extendedKeyUsages?: TTemplateV2Policy["extendedKeyUsages"];
  subjectAlternativeNames?: TTemplateV2Policy["subjectAlternativeNames"];
  validity?: TTemplateV2Policy["validity"];
  signatureAlgorithm?: TTemplateV2Policy["signatureAlgorithm"];
  keyAlgorithm?: TTemplateV2Policy["keyAlgorithm"];
};

export type TCertificateTemplateV2Update = Partial<
  Pick<
    TCertificateTemplateV2,
    | "slug"
    | "description"
    | "attributes"
    | "keyUsages"
    | "extendedKeyUsages"
    | "subjectAlternativeNames"
    | "validity"
    | "signatureAlgorithm"
    | "keyAlgorithm"
  >
>;

export interface TCertificateRequest {
  commonName?: string;
  organizationName?: string;
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

export interface TTemplateValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}
