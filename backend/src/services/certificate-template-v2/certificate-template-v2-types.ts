import { TCertificateTemplatesV2, TCertificateTemplatesV2Insert } from "@app/db/schemas/certificate-templates-v2";

export interface TTemplateV2Policy {
  attributes: Array<{
    type:
      | "common_name"
      | "organization_name"
      | "organization_unit"
      | "locality"
      | "state"
      | "country"
      | "email"
      | "street_address"
      | "postal_code";
    include: "mandatory" | "optional" | "prohibit";
    value?: string[];
  }>;
  keyUsages: {
    requiredUsages: { all: string[] };
    optionalUsages: { all: string[] };
  };
  extendedKeyUsages: {
    requiredUsages: { all: string[] };
    optionalUsages: { all: string[] };
  };
  subjectAlternativeNames: Array<{
    type: "dns_name" | "ip_address" | "email" | "uri";
    include: "mandatory" | "optional" | "prohibit";
    value?: string[];
  }>;
  validity: {
    maxDuration: { value: number; unit: "days" | "months" | "years" };
    minDuration?: { value: number; unit: "days" | "months" | "years" };
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
    | "name"
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
  organization?: string;
  organizationUnit?: string;
  locality?: string;
  state?: string;
  country?: string;
  email?: string;
  streetAddress?: string;
  postalCode?: string;
  keyUsages?: string[];
  extendedKeyUsages?: string[];
  subjectAlternativeNames?: Array<{
    type: "dns_name" | "ip_address" | "email" | "uri";
    value: string;
  }>;
  validity?: {
    ttl: string;
  };
  signatureAlgorithm?: string;
  keyAlgorithm?: string;
}

export interface TTemplateValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}
