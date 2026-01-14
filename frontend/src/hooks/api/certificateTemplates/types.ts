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
  keyUsages: string[];
  extendedKeyUsages: string[];
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
  keyUsages?: string[];
  extendedKeyUsages?: string[];
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
  keyUsages: string[];
  extendedKeyUsages: string[];
};

export type TUpdateCertificateTemplateV2DTO = {
  templateName: string;
  caName?: string;
  name?: string;
  commonName?: string;
  subjectAlternativeName?: string;
  ttl?: string;
  projectId: string;
  keyUsages?: string[];
  extendedKeyUsages?: string[];
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
