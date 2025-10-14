import { CertExtendedKeyUsage, CertKeyUsage } from "../certificates/enums";

export type TCertificateTemplate = {
  id: string;
  caId: string;
  caName: string;
  projectId: string;
  pkiCollectionId?: string;
  name: string;
  commonName: string;
  subjectAlternativeName: string;
  ttl: string;
  keyUsages: CertKeyUsage[];
  extendedKeyUsages: CertExtendedKeyUsage[];
};

export type TCertificateTemplateV2 = {
  id: string;
  caId: string;
  caName: string;
  projectId: string;
  pkiCollectionId?: string;
  name: string;
  commonName: string;
  subjectAlternativeName: string;
  ttl: string;
  keyUsages: CertKeyUsage[];
  extendedKeyUsages: CertExtendedKeyUsage[];
  updatedAt: string;
  createdAt: string;
  ca: {
    name: string;
    id: string;
  };
};

export type TCreateCertificateTemplateDTO = {
  caId: string;
  pkiCollectionId?: string;
  name: string;
  commonName: string;
  subjectAlternativeName: string;
  ttl: string;
  projectId: string;
  keyUsages: CertKeyUsage[];
  extendedKeyUsages: CertExtendedKeyUsage[];
};

export type TUpdateCertificateTemplateDTO = {
  id: string;
  caId?: string;
  pkiCollectionId?: string;
  name?: string;
  commonName?: string;
  subjectAlternativeName?: string;
  ttl?: string;
  projectId: string;
  keyUsages?: CertKeyUsage[];
  extendedKeyUsages?: CertExtendedKeyUsage[];
};

export type TDeleteCertificateTemplateDTO = {
  id: string;
  projectId: string;
};

export type TCreateCertificateTemplateV2DTO = {
  caName: string;
  name: string;
  commonName: string;
  subjectAlternativeName: string;
  ttl: string;
  projectId: string;
  keyUsages: CertKeyUsage[];
  extendedKeyUsages: CertExtendedKeyUsage[];
};

export type TUpdateCertificateTemplateV2DTO = {
  templateName: string;
  caName?: string;
  name?: string;
  commonName?: string;
  subjectAlternativeName?: string;
  ttl?: string;
  projectId: string;
  keyUsages?: CertKeyUsage[];
  extendedKeyUsages?: CertExtendedKeyUsage[];
};

export type TDeleteCertificateTemplateV2DTO = {
  templateName: string;
  projectId: string;
};

export type TCreateEstConfigDTO = {
  certificateTemplateId: string;
  caChain?: string;
  passphrase: string;
  isEnabled: boolean;
  disableBootstrapCertValidation: boolean;
};

export type TUpdateEstConfigDTO = {
  certificateTemplateId: string;
  caChain?: string;
  passphrase?: string;
  isEnabled?: boolean;
  disableBootstrapCertValidation?: boolean;
};

export type TEstConfig = {
  id: string;
  certificateTemplateId: string;
  caChain: string;
  isEnabled: boolean;
  disableBootstrapCertValidation: boolean;
};

export type TListCertificateTemplatesDTO = {
  limit?: number;
  offset?: number;
  projectId: string;
};

export type TCertificateTemplateV2Policy = {
  attributes: Array<{
    type: "common_name";
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
};

export type TCertificateTemplateV2New = {
  id: string;
  projectId: string;
  slug: string;
  description?: string;
  attributes: any;
  keyUsages: any;
  extendedKeyUsages: any;
  subjectAlternativeNames: any;
  validity: any;
  signatureAlgorithm: any;
  keyAlgorithm: any;
  createdAt: string;
  updatedAt: string;
};

export type TCreateCertificateTemplateV2NewDTO = {
  projectId: string;
  slug: string;
  description?: string;
  attributes: TCertificateTemplateV2Policy["attributes"];
  keyUsages: TCertificateTemplateV2Policy["keyUsages"];
  extendedKeyUsages: TCertificateTemplateV2Policy["extendedKeyUsages"];
  subjectAlternativeNames: TCertificateTemplateV2Policy["subjectAlternativeNames"];
  validity: TCertificateTemplateV2Policy["validity"];
  signatureAlgorithm: TCertificateTemplateV2Policy["signatureAlgorithm"];
  keyAlgorithm: TCertificateTemplateV2Policy["keyAlgorithm"];
};

export type TUpdateCertificateTemplateV2NewDTO = {
  templateId: string;
  slug?: string;
  description?: string;
  attributes?: TCertificateTemplateV2Policy["attributes"];
  keyUsages?: TCertificateTemplateV2Policy["keyUsages"];
  extendedKeyUsages?: TCertificateTemplateV2Policy["extendedKeyUsages"];
  subjectAlternativeNames?: TCertificateTemplateV2Policy["subjectAlternativeNames"];
  validity?: TCertificateTemplateV2Policy["validity"];
  signatureAlgorithm?: TCertificateTemplateV2Policy["signatureAlgorithm"];
  keyAlgorithm?: TCertificateTemplateV2Policy["keyAlgorithm"];
};

export type TDeleteCertificateTemplateV2NewDTO = {
  templateId: string;
};

export type TListCertificateTemplatesV2DTO = {
  projectId: string;
  limit?: number;
  offset?: number;
};

export type TGetCertificateTemplateV2ByIdDTO = {
  templateId: string;
};
