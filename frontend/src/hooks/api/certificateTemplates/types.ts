export type TCertificateTemplateListEntry = {
  id: string;
  name: string;
  caName: string;
};

export type TCertificateTemplate = {
  id: string;
  caId: string;
  name: string;
  commonName: string;
  ttl: string;
};

export type TCreateCertificateTemplateDTO = {
  caId: string;
  name: string;
  commonName: string;
  ttl: string;
  projectId: string;
};

export type TUpdateCertificateTemplateDTO = {
  id: string;
  caId?: string;
  name?: string;
  commonName?: string;
  ttl?: string;
  projectId: string;
};

export type TDeleteCertificateTemplateDTO = {
  id: string;
  projectId: string;
};
