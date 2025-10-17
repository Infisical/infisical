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
  subject?: Array<{
    type: "common_name" | "organization" | "country";
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
};

export type TCertificateTemplateV2New = {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  subject?: TCertificateTemplateV2Policy["subject"];
  sans?: TCertificateTemplateV2Policy["sans"];
  keyUsages?: TCertificateTemplateV2Policy["keyUsages"];
  extendedKeyUsages?: TCertificateTemplateV2Policy["extendedKeyUsages"];
  algorithms?: TCertificateTemplateV2Policy["algorithms"];
  validity?: TCertificateTemplateV2Policy["validity"];
  createdAt: string;
  updatedAt: string;
};

export type TCreateCertificateTemplateV2NewDTO = {
  projectId: string;
  name: string;
  description?: string;
  subject?: TCertificateTemplateV2Policy["subject"];
  sans?: TCertificateTemplateV2Policy["sans"];
  keyUsages?: TCertificateTemplateV2Policy["keyUsages"];
  extendedKeyUsages?: TCertificateTemplateV2Policy["extendedKeyUsages"];
  algorithms?: TCertificateTemplateV2Policy["algorithms"];
  validity?: TCertificateTemplateV2Policy["validity"];
};

export type TUpdateCertificateTemplateV2NewDTO = {
  templateId: string;
  name?: string;
  description?: string;
  subject?: TCertificateTemplateV2Policy["subject"];
  sans?: TCertificateTemplateV2Policy["sans"];
  keyUsages?: TCertificateTemplateV2Policy["keyUsages"];
  extendedKeyUsages?: TCertificateTemplateV2Policy["extendedKeyUsages"];
  algorithms?: TCertificateTemplateV2Policy["algorithms"];
  validity?: TCertificateTemplateV2Policy["validity"];
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
