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
};

export type TCreateCertificateTemplateDTO = {
  caId: string;
  pkiCollectionId?: string;
  name: string;
  commonName: string;
  subjectAlternativeName: string;
  ttl: string;
  projectId: string;
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
};

export type TDeleteCertificateTemplateDTO = {
  id: string;
  projectId: string;
};

export type TCreateEstConfigDTO = {
  certificateTemplateId: string;
  caChain: string;
  passphrase: string;
  isEnabled: boolean;
};

export type TUpdateEstConfigDTO = {
  certificateTemplateId: string;
  caChain?: string;
  passphrase?: string;
  isEnabled?: boolean;
};

export type TEstConfig = {
  id: string;
  certificateTemplateId: string;
  caChain: string;
  isEnabled: false;
};
