export type TCertificateTemplateListEntry = {
  id: string;
  name: string;
  caName: string;
  caId: string;
};

export type TCertificateTemplate = {
  id: string;
  caId: string;
  name: string;
  commonName: string;
  subjectAlternativeName: string;
  ttl: string;
};

export type TCreateCertificateTemplateDTO = {
  caId: string;
  name: string;
  commonName: string;
  subjectAlternativeName: string;
  ttl: string;
  projectId: string;
};

export type TUpdateCertificateTemplateDTO = {
  id: string;
  caId?: string;
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
